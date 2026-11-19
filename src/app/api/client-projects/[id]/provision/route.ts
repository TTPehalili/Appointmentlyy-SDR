import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { fail, json, readJson } from '@/lib/server/agreements/core';
import { cpFail, ownerProject } from '@/lib/server/clientProjects/http';
import { checkTemplates, exclusive, provisionView, runBranding, runInvites, runLogo, runMembers, runTemplatesDraft, runTemplatesSeed, runWorkspace } from '@/lib/server/clientProjects/provision';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/client-projects/:id/provision (owner only): the preview of every step and the provisioning record. */
export async function GET(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const o = await ownerProject(req, id, 'read');
  if (o instanceof NextResponse) return o;
  try {
    return json({ success: true, provision: await provisionView(o.project) });
  } catch (err) {
    return cpFail(err, 'provision');
  }
}

/**
 * POST /api/client-projects/:id/provision (owner only). One step per click, one step at a time per project:
 *   { action: 'workspace', name, code, plan, seats, adminEmail, adminName }   create + first Admin (no email) + link
 *   { action: 'branding', brandColor?, displayName?, logoInitials?, supportEmail? }
 *   { action: 'logo' }                                                         the accepted intake logo into the workspace
 *   { action: 'members', emails? }                                             create members (seat check first, no email)
 *   { action: 'invites' }                                                      SEND the invite emails (separate click)
 *   { action: 'templates_draft' }                                              AI drafts (nothing seeded)
 *   { action: 'templates_check', templates }                                   rule check of the edited drafts (nothing stored)
 *   { action: 'templates_seed', templates }                                    seed the owner-approved templates (stable ids)
 */
export async function POST(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const o = await ownerProject(req, id, 'write');
  if (o instanceof NextResponse) return o;
  const body = await readJson(req, 64 * 1024);
  if (!body) return fail(400, 'Send the details as JSON (at most 64 KB).');
  const { project: p, owner, ctx } = o;
  const action = String(body.action ?? '');
  // The expensive or outward-facing actions have their own, tighter allowances.
  if (action === 'templates_draft' && !rateLimit(`cp-owner-ai:${owner.email}`, 30, 10 * 60_000)) return fail(429, 'Too many AI requests. Wait a few minutes and try again.');
  if (action === 'invites' && !rateLimit(`cp-provision-invites:${owner.email}`, 10, 10 * 60_000)) return fail(429, 'Too many invite runs. Wait a few minutes and try again.');
  try {
    let out: { result: Record<string, unknown> };
    switch (action) {
      case 'workspace':
        out = await exclusive(p.id, () => runWorkspace(p, owner, ctx, body));
        break;
      case 'branding':
        out = await exclusive(p.id, () => runBranding(p, owner, ctx, body));
        break;
      case 'logo':
        out = await exclusive(p.id, () => runLogo(p, owner, ctx));
        break;
      case 'members':
        out = await exclusive(p.id, () => runMembers(p, owner, ctx, body));
        break;
      case 'invites':
        out = await exclusive(p.id, () => runInvites(p, owner, ctx));
        break;
      case 'templates_draft':
        out = await exclusive(p.id, () => runTemplatesDraft(p, ctx));
        break;
      case 'templates_check':
        out = await checkTemplates(p, body);
        break;
      case 'templates_seed':
        out = await exclusive(p.id, () => runTemplatesSeed(p, owner, ctx, body));
        break;
      default:
        return fail(400, 'Unknown action.');
    }
    return json({ success: true, ...out, provision: await provisionView(p) });
  } catch (err) {
    return cpFail(err, `provision ${action.slice(0, 20)}`);
  }
}
