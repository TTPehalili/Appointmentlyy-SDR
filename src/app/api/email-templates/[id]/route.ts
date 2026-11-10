import { NextRequest, NextResponse } from 'next/server';
import { canSeeTemplate, validateTemplate } from '@/lib/emailTemplates';
import { getEmailTemplateStore, isTemplateId } from '@/lib/server/emailTemplateStore';
import {
  auditTemplate,
  canEditTemplate,
  canManageTemplates,
  checkAssignees,
  fail,
  json,
  pickEditable,
  readJsonObject,
  requireSession,
  viewerOf,
} from '@/lib/server/emailTemplateApi';

type Ctx = { params: Promise<{ id: string }> };
const notFound = () => fail(404, 'Template not found.');

/** GET /api/email-templates/:id (e.g. a workflow step resolving the template it sends). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  if (!isTemplateId(id)) return notFound();
  try {
    const t = await getEmailTemplateStore().get(session.tenantCode, id);
    if (!t || !canSeeTemplate(t, viewerOf(session))) return notFound();
    return json({ success: true, template: t });
  } catch (err) {
    console.error('[email-templates/:id GET]', err);
    return fail(500, 'Could not load the template.');
  }
}

/**
 * PATCH /api/email-templates/:id  any subset of the template fields, e.g. { archived: true } or
 * { assignedTo: ["rep@client.com"] }. Team templates: Supervisor and above. Private templates:
 * their creator only (and only Supervisor and above may turn one into a team template).
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  if (!isTemplateId(id)) return notFound();
  try {
    const store = getEmailTemplateStore();
    const current = await store.get(session.tenantCode, id);
    if (!current || !canSeeTemplate(current, viewerOf(session))) return notFound();
    if (!canEditTemplate(session, current)) return fail(403, 'Only supervisors, managers and admins can change team templates.');

    const body = await readJsonObject(req);
    if (!body) return fail(400, 'Send the changes as JSON.');
    const patch = pickEditable(body);
    if (patch.visibility === 'team' && current.visibility !== 'team' && !canManageTemplates(session)) {
      return fail(403, 'Only supervisors, managers and admins can share a template with the team.');
    }
    if (patch.visibility === 'private' && current.visibility === 'team' && current.createdBy.toLowerCase() !== session.email.toLowerCase()) {
      return fail(403, 'Only the person who created a team template can make it private. Archive it instead.');
    }
    const v = validateTemplate({ ...current, ...patch });
    if (!v.ok) return fail(400, v.error, v.field);
    const bad = await checkAssignees(session, v.value);
    if (bad) return bad;

    const updated = await store.update(session.tenantCode, id, v.value);
    if (!updated) return notFound();
    const action =
      updated.archived !== current.archived
        ? updated.archived ? 'archive' : 'unarchive'
        : 'assignedTo' in patch && Object.keys(patch).length === 1
          ? 'assign'
          : 'update';
    await auditTemplate(session, action, updated, action === 'assign' ? { assignedTo: updated.assignedTo } : {});
    return json({ success: true, template: updated });
  } catch (err) {
    console.error('[email-templates/:id PATCH]', err);
    return fail(500, 'Could not update the template.');
  }
}

/**
 * DELETE /api/email-templates/:id
 * Private templates: their creator. Team templates: Supervisor and above, once archived (workflow
 * steps may point at a live template by id, so it is archived first).
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  if (!isTemplateId(id)) return notFound();
  try {
    const store = getEmailTemplateStore();
    const current = await store.get(session.tenantCode, id);
    if (!current || !canSeeTemplate(current, viewerOf(session))) return notFound();
    if (!canEditTemplate(session, current)) return fail(403, 'Only supervisors, managers and admins can delete team templates.');
    if (current.visibility === 'team' && !current.archived) return fail(409, 'Archive the template before deleting it.');
    if (!(await store.remove(session.tenantCode, id))) return notFound();
    await auditTemplate(session, 'delete', current);
    return json({ success: true });
  } catch (err) {
    console.error('[email-templates/:id DELETE]', err);
    return fail(500, 'Could not delete the template.');
  }
}
