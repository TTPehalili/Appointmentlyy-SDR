import { NextRequest, NextResponse } from 'next/server';
import { validateTemplate } from '@/lib/emailTemplates';
import { getEmailTemplateStore, TemplateLimitError } from '@/lib/server/emailTemplateStore';
import {
  auditTemplate,
  canManageTemplates,
  checkAssignees,
  ensureDemoSeed,
  fail,
  json,
  pickEditable,
  readJsonObject,
  requireSession,
  visibleTo,
} from '@/lib/server/emailTemplateApi';

/**
 * GET /api/email-templates[?archived=1]
 * The templates the signed-in person may use, for their current workspace only (from the session):
 * - Supervisor and above: every team template (archived ones with ?archived=1) plus their own private ones.
 * - Reps: team templates assigned to them or to everyone, plus their own private ones.
 */
export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  try {
    const store = getEmailTemplateStore();
    let all = await store.list(session.tenantCode);
    if (await ensureDemoSeed(session, all)) all = await store.list(session.tenantCode);
    const canManage = canManageTemplates(session);
    const withArchived = canManage && req.nextUrl.searchParams.get('archived') === '1';
    const templates = visibleTo(session, all).filter((t) => withArchived || !t.archived);
    const campaigns = [...new Set(templates.filter((t) => !t.archived && t.campaign).map((t) => t.campaign))].sort();
    return json({ success: true, templates, campaigns, canManage, me: session.email, storage: store.backend });
  } catch (err) {
    console.error('[email-templates GET]', err);
    return fail(500, 'Could not load templates.');
  }
}

/**
 * POST /api/email-templates { name, subject, body, frameworkId?, campaign?, purpose, outcomeTags?, visibility?, assignedTo?, sequenceStep? }
 * Supervisor and above create team or private templates (team by default); reps create private
 * templates only.
 */
export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  try {
    const body = await readJsonObject(req);
    if (!body) return fail(400, 'Send the template as JSON.');
    const raw = pickEditable(body);
    const canManage = canManageTemplates(session);
    if (raw.visibility === undefined) raw.visibility = canManage ? 'team' : 'private';
    if (raw.visibility === 'team' && !canManage) return fail(403, 'Only supervisors, managers and admins can create team templates.');
    raw.archived = false;
    const v = validateTemplate(raw);
    if (!v.ok) return fail(400, v.error, v.field);
    const bad = await checkAssignees(session, v.value);
    if (bad) return bad;
    const created = await getEmailTemplateStore().create(session.tenantCode, v.value, session.email);
    await auditTemplate(session, 'create', created, { assignedTo: created.assignedTo });
    return json({ success: true, template: created });
  } catch (err) {
    if (err instanceof TemplateLimitError) return fail(409, err.message);
    console.error('[email-templates POST]', err);
    return fail(500, 'Could not save the template.');
  }
}
