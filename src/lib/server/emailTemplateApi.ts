/** Shared helpers for the /api/email-templates route handlers (route files may only export handlers). */
import { NextRequest, NextResponse } from 'next/server';
import { isDemoSession } from '@/lib/demoMode';
import { canSeeTemplate, type EmailTemplate, type TemplateInput } from '@/lib/emailTemplates';
import { getServerSession, hasRank, type ServerSession } from '@/lib/server/session';
import { getTenantStore } from '@/lib/server/tenantStore';
import { getEmailTemplateStore, seedId } from '@/lib/server/emailTemplateStore';
import { DEMO_SEED_AUTHOR, DEMO_TEMPLATE_SEEDS } from '@/lib/server/emailTemplateSeeds';

export const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export const fail = (status: number, error: string, field?: string) => json({ success: false, error, ...(field ? { field } : {}) }, status);

/** The signed-in person, or the 401 to send. */
export async function requireSession(req: NextRequest): Promise<ServerSession | NextResponse> {
  const session = await getServerSession(req);
  if (!session) return fail(401, 'Please sign in again.');
  return session;
}

/** Supervisor and above (platform staff included) manage team templates. */
export const canManageTemplates = (s: ServerSession) => hasRank(s, 'Supervisor');

export const viewerOf = (s: ServerSession) => ({ email: s.email, canManage: canManageTemplates(s) });

export const visibleTo = (s: ServerSession, list: EmailTemplate[]) => list.filter((t) => canSeeTemplate(t, viewerOf(s)));

/** May this person edit (or archive / delete) the template? */
export function canEditTemplate(s: ServerSession, t: EmailTemplate): boolean {
  if (t.visibility === 'private') return t.createdBy.toLowerCase() === s.email.toLowerCase();
  return canManageTemplates(s);
}

const seeded = new Set<string>();

/**
 * Demo workspace only: put the sample library in place the first time it is listed (an empty
 * workspace). Fixed ids make a second, concurrent attempt a no-op. Client workspaces start empty.
 */
export async function ensureDemoSeed(s: ServerSession, current: EmailTemplate[]): Promise<boolean> {
  if (!isDemoSession(s) || current.length > 0 || seeded.has(s.tenantCode)) return false;
  seeded.add(s.tenantCode);
  try {
    await getEmailTemplateStore().seed(
      s.tenantCode,
      DEMO_TEMPLATE_SEEDS.map(({ key, ...t }) => ({ ...t, id: seedId(s.tenantCode, key) })),
      DEMO_SEED_AUTHOR,
    );
  } catch (err) {
    seeded.delete(s.tenantCode);
    throw err;
  }
  return true;
}

/** Every assignee must be someone in this workspace (or the signed-in person). */
export async function checkAssignees(s: ServerSession, input: TemplateInput): Promise<NextResponse | null> {
  if (input.assignedTo.length === 0) return null;
  const members = await getTenantStore().listMembers({ tenantCode: s.tenantCode });
  const known = new Set(members.filter((m) => m.status !== 'removed').map((m) => m.email.toLowerCase()));
  known.add(s.email.toLowerCase());
  const unknown = input.assignedTo.filter((e) => !known.has(e));
  if (unknown.length) return fail(400, `Not in this workspace: ${unknown.slice(0, 3).join(', ')}.`, 'assignedTo');
  return null;
}

/** Team template changes go to the workspace audit log (private drafts don't). */
export async function auditTemplate(s: ServerSession, action: string, t: EmailTemplate, detail: Record<string, unknown> = {}) {
  if (t.visibility !== 'team') return;
  try {
    await getTenantStore().addAudit({
      actorEmail: s.email,
      tenantCode: s.tenantCode,
      action: `email_template.${action}`,
      target: t.id,
      detail: { name: t.name, campaign: t.campaign, ...detail },
    });
  } catch (err) {
    console.error('[email-templates audit]', err);
  }
}

/** Fields a request may set. Tenant, author and timestamps always come from the server. */
export const EDITABLE_FIELDS = [
  'name',
  'subject',
  'body',
  'frameworkId',
  'campaign',
  'purpose',
  'outcomeTags',
  'visibility',
  'assignedTo',
  'sequenceStep',
  'archived',
] as const;

export function pickEditable(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of EDITABLE_FIELDS) if (k in body) out[k] = body[k];
  return out;
}

export async function readJsonObject(req: NextRequest): Promise<Record<string, unknown> | null> {
  const body = (await req.json().catch(() => null)) as unknown;
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}
