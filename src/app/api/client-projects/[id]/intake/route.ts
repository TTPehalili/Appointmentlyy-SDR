import { NextRequest, NextResponse } from 'next/server';
import { fail, json, readJson } from '@/lib/server/agreements/core';
import { getClientProjectStore, isCpId } from '@/lib/server/clientProjectStore';
import { cpFail, ownerProject } from '@/lib/server/clientProjects/http';
import { CpError } from '@/lib/server/clientProjects/service';
import { acceptSubmission, attachRequest, configRequest, ownerCheckDns, ownerCheckKeys, reapply, requestChanges, setIntakeEnabled, setPayment, setWorkspace, type AcceptOptions } from '@/lib/server/clientProjects/intake';
import { ownerIntake } from '@/lib/server/clientProjects/intakeOwner';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/client-projects/:id/intake (owner only): requests, submissions (every version), files, client data. */
export async function GET(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const o = await ownerProject(req, id, 'read');
  if (o instanceof NextResponse) return o;
  try {
    return json({ success: true, intake: await ownerIntake(o.project, { sync: req.nextUrl.searchParams.get('sync') === '1' }) });
  } catch (err) {
    return cpFail(err, 'intake');
  }
}

function acceptOpts(v: unknown): AcceptOptions {
  const r = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  return {
    branding: r.branding === true,
    testers: r.testers === true,
    company: r.company === true,
    invites: Array.isArray(r.invites) ? r.invites.filter((x): x is string => typeof x === 'string').slice(0, 300) : null,
  };
}

/**
 * POST /api/client-projects/:id/intake (owner only)
 *   { action: 'enable', on }                                   Client Intake on/off for the project
 *   { action: 'workspace', tenantCode }                        the client's own workspace (branding, invites, keys)
 *   { action: 'attach', taskId, kind, template?, schema? }     a step on any client item (template or custom form)
 *   { action: 'config', requestId, envelopeId? domain? extraRecords? providers? }
 *   { action: 'accept', requestId, submissionId, apply: { branding?, invites?: emails[], testers?, company? } }
 *   { action: 'reapply', requestId, submissionId, apply }      e.g. after picking the workspace
 *   { action: 'changes', requestId, submissionId, note }       Request changes (the note is shown to the client)
 *   { action: 'payment', requestId, state: received|not_received|awaiting, amount?, date?, method?, reference?, note? }
 *   { action: 'check_dns' | 'check_keys', requestId }
 *   { action: 'sync' }                                         re-read Agreements and key checks now
 */
export async function POST(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const o = await ownerProject(req, id, 'write');
  if (o instanceof NextResponse) return o;
  const body = await readJson(req, 128 * 1024);
  if (!body) return fail(400, 'Send the details as JSON (at most 128 KB).');
  const { project: p, ctx, owner } = o;
  try {
    let extra: Record<string, unknown> = {};
    switch (body.action) {
      case 'enable':
        await setIntakeEnabled(p, body.on === true, ctx);
        break;
      case 'workspace':
        await setWorkspace(p, body.tenantCode, ctx);
        break;
      case 'attach': {
        const t = isCpId(body.taskId) ? await getClientProjectStore().getTask(body.taskId) : null;
        if (!t || t.projectId !== p.id) throw new CpError(404, 'Card not found.');
        await attachRequest(p, t, body, ctx);
        break;
      }
      case 'config':
        await configRequest(p, body.requestId, body, ctx);
        break;
      case 'accept':
        extra = { submission: (await acceptSubmission(p, body.requestId, body.submissionId, acceptOpts(body.apply), owner, ctx)).submission };
        break;
      case 'reapply':
        extra = { submission: await reapply(p, body.requestId, body.submissionId, acceptOpts(body.apply), owner, ctx) };
        break;
      case 'changes':
        await requestChanges(p, body.requestId, body.submissionId, body.note, ctx);
        break;
      case 'payment':
        await setPayment(p, body.requestId, { state: body.state, amount: body.amount, date: body.date, method: body.method, reference: body.reference, note: body.note }, ctx);
        break;
      case 'check_dns':
        await ownerCheckDns(p, body.requestId, ctx);
        break;
      case 'check_keys':
        await ownerCheckKeys(p, body.requestId, ctx);
        break;
      case 'sync':
        break;
      default:
        return fail(400, 'Unknown action.');
    }
    return json({ success: true, ...extra, intake: await ownerIntake(p, { sync: body.action === 'sync' }) });
  } catch (err) {
    return cpFail(err, `intake ${String(body.action).slice(0, 20)}`);
  }
}
