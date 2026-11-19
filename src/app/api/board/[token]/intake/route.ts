import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { fail, json, readJson } from '@/lib/server/agreements/core';
import { boardPayload } from '@/lib/server/clientProjects/board';
import { cpFail, projectByToken } from '@/lib/server/clientProjects/http';
import { clientDailyCapReached } from '@/lib/server/clientProjects/service';
import { clientCheckDns, clientCheckKeys, clientPaid, clientRemoveFile, clientSaveDraft, clientSetDomain, clientSubmit } from '@/lib/server/clientProjects/intake';

type Ctx = { params: Promise<{ token: string }> };

/** Per link and per address, in 10 minutes. */
const LIMITS: Record<string, [number, number]> = { save: [120, 60], submit: [30, 20], remove_file: [60, 40], set_domain: [20, 10], check_dns: [30, 20], check_keys: [30, 20], paid: [10, 6] };

/**
 * POST /api/board/:token/intake   (public; the link token is the credential)
 *   { action: 'save',        requestId, name, answers }      explicit "Save draft" (never autosaved)
 *   { action: 'submit',      requestId, name, answers }      a new immutable version, for the owner's review
 *   { action: 'remove_file', requestId, name, fileId }       before submitting (a submitted file stays as evidence)
 *   { action: 'set_domain',  requestId, name, domain }       the DNS item's sending domain
 *   { action: 'check_dns' | 'check_keys', requestId, name }  the platform checks; the card completes when it passes
 *   { action: 'paid',        requestId, name, receiptFileId? } "I've paid": Confirming your payment (only we confirm)
 * Token-scoped (only this project's requests on cards the client can see), rate-limited per link and address, the body
 * capped at 256 KB, and the project's daily caps (client events, submissions) apply. The reply is the refreshed board.
 */
export async function POST(req: NextRequest, c: Ctx) {
  const { token } = await c.params;
  const found = await projectByToken(req, token);
  if (found instanceof NextResponse) return found;
  const body = await readJson(req, 256 * 1024);
  if (!body) return fail(400, 'Send the details as JSON (at most 256 KB).');
  const action = typeof body.action === 'string' && Object.hasOwn(LIMITS, body.action) ? body.action : null;
  if (!action) return fail(404, 'Unknown action.');
  const limit = LIMITS[action];
  if (!rateLimit(`cp-intake-${action}:${found.tokenKey}`, limit[0], 10 * 60_000) || !rateLimit(`cp-intake-${action}-ip:${found.ip}`, limit[1], 10 * 60_000)) return fail(429, 'Too many requests. Wait a few minutes and try again.');
  const { project } = found;
  if (project.status === 'archived') return fail(409, 'This board is closed.');
  // "Who are you?": a picked client-side person acts under their own name (an id of ours or of another project is ignored).
  if (typeof body.personId === 'string') {
    const person = (project.people ?? []).find((x) => x.id === body.personId && x.side === 'client');
    if (person) body.name = person.name;
  }
  const origin = req.nextUrl.origin;
  try {
    if (await clientDailyCapReached(project)) return fail(429, 'This board has had a lot of activity today. Please try again tomorrow, or contact us directly.');
    const input = { requestId: body.requestId, name: body.name, answers: body.answers, fileId: body.fileId, domain: body.domain, receiptFileId: body.receiptFileId };
    let extra: Record<string, unknown> = {};
    if (action === 'save') await clientSaveDraft(project, input, origin);
    else if (action === 'submit') extra = { version: (await clientSubmit(project, input, origin)).submission.version };
    else if (action === 'remove_file') await clientRemoveFile(project, input, origin);
    else if (action === 'set_domain') await clientSetDomain(project, input, origin);
    else if (action === 'check_dns') await clientCheckDns(project, input, origin);
    else if (action === 'check_keys') await clientCheckKeys(project, input, origin);
    else if (action === 'paid') await clientPaid(project, input, origin);
    return json({ success: true, ...extra, board: await boardPayload(project) });
  } catch (err) {
    return cpFail(err, `board intake ${action}`);
  }
}
