import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { getServerSession } from '@/lib/server/session';
import { getAppBaseUrl, rateLimit } from '@/lib/authToken';
import { getSupportTicketStore, normalizeTicketId } from '@/lib/server/supportTickets';
import { cleanText, fail, ok, readJsonObject, storageFail } from '@/lib/server/supportTicketsHttp';
import { deployedSha, markFixReady } from '@/lib/server/supportAutomation';
import { normalizeSha, shaMatches } from '@/lib/supportAutomation';
import { SUPPORT_LIMITS } from '@/lib/supportReport';
import { customerSafe } from '@/lib/server/supportAi';

/**
 * Release linking for publishing (support step 2). Links tickets to the release commit that fixes them, so their
 * resolution replies go out by themselves once that commit is the one running (supportAutomation.ts). It never
 * deploys or sends anything itself.
 *
 * Who: Appointmentlyy staff (signed in), or a script with `Authorization: Bearer <SUPPORT_RELEASE_TOKEN>` (a Railway
 * variable, at least 32 characters; unset = session only).
 *
 *   POST { sha, tickets: ["TKT-2611-AB12", { id, reply? }, ...], draft?: true, notes? }
 *        -> each ticket "Fix ready" for `sha` (max 50). A ticket without `reply` gets an AI draft (draft=true and the
 *           support AI is on) or the template. Response: per-ticket result and whether `sha` is already live here.
 *   GET  ?sha=<commit>  -> the Fix ready tickets linked to that commit, and the commit this server runs.
 */
const MAX_TICKETS = 50;

function tokenOk(req: NextRequest): boolean {
  const want = (process.env.SUPPORT_RELEASE_TOKEN || '').trim();
  const auth = req.headers.get('authorization') || '';
  if (want.length < 32 || !auth.startsWith('Bearer ')) return false;
  const a = crypto.createHash('sha256').update(auth.slice(7).trim()).digest();
  const b = crypto.createHash('sha256').update(want).digest();
  return crypto.timingSafeEqual(a, b);
}

/** A browser request from another site (the session path is cookie-authenticated; SameSite=Lax alone is not enough). */
function crossSite(req: NextRequest): boolean {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return true;
  const origin = req.headers.get('origin');
  return !!origin && origin !== req.nextUrl.origin && origin !== getAppBaseUrl();
}

async function caller(req: NextRequest): Promise<{ by: string } | { error: Response }> {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';
  // The per-IP key is spoofable (X-Forwarded-For, AUDIT M-2): one global bucket too, so rotating the header gains nothing.
  if (!rateLimit('support-releases:all', 120, 60_000) || !rateLimit(`support-releases:${ip}`, 30, 60_000)) return { error: fail(429, 'Too many requests. Wait a minute.') };
  if (req.headers.get('authorization')) {
    if (tokenOk(req)) return { by: 'release script' };
    console.warn('[support-auto] releases: rejected a bearer token');
    return { error: fail(401, 'Not authorised.') };
  }
  if (crossSite(req)) return { error: fail(403, 'Not allowed from another site.') };
  const session = await getServerSession(req);
  if (!session) return { error: fail(401, 'Please sign in again.') };
  if (!session.isPlatformAdmin) return { error: fail(404, 'Not found') };
  return { by: session.name || session.email };
}

export async function POST(req: NextRequest) {
  const who = await caller(req);
  if ('error' in who) return who.error;
  const body = await readJsonObject(req, 96 * 1024);
  if (!body || body === 'too_large') return fail(400, 'That request could not be read.');
  const sha = normalizeSha(body.sha);
  if (!sha) return fail(400, 'sha must be the release commit id (7 to 40 letters a-f and digits).');
  if (!Array.isArray(body.tickets) || !body.tickets.length) return fail(400, 'tickets must list at least one ticket id.');
  if (body.tickets.length > MAX_TICKETS) return fail(400, `At most ${MAX_TICKETS} tickets per call.`);
  const items: { id: string | null; raw: string; reply: string }[] = body.tickets.map((x: unknown) => {
    const o = x && typeof x === 'object' ? (x as Record<string, unknown>) : { id: x };
    return { id: normalizeTicketId(o.id), raw: String(o.id ?? '').slice(0, 40), reply: cleanText(o.reply, SUPPORT_LIMITS.reply) };
  });
  // Replies set here reach customers by themselves once the release is live: plain words only (no links, domains,
  // phone numbers or addresses). Anything richer is written by a person on the ticket itself (/api/tickets/[id]/fix).
  const unsafe = items.find((it) => it.reply && customerSafe(it.reply).changed);
  if (unsafe) return fail(400, `The reply for ${unsafe.raw || 'a ticket'} contains a link, address or phone number. Write it on the ticket instead.`);
  const notes = cleanText(body.notes, 1500);
  const results: { id: string; ok: boolean; error?: string; drafted?: string }[] = [];
  try {
    for (const it of items) {
      if (!it.id) {
        results.push({ id: it.raw, ok: false, error: 'not a ticket id' });
        continue;
      }
      const r = await markFixReady(it.id, { sha, reply: it.reply, by: who.by, draft: body.draft === true, notes });
      results.push(r.ok ? { id: it.id, ok: true, drafted: r.drafted } : { id: it.id, ok: false, error: r.error });
    }
    const dep = deployedSha();
    console.info(`[support-auto] ${who.by} linked ${results.filter((r) => r.ok).length} ticket(s) to release ${sha.slice(0, 12)}`);
    return ok({ sha, linked: results.filter((r) => r.ok).length, results, deployedSha: dep, alreadyLive: shaMatches(sha, dep) });
  } catch (err) {
    return storageFail(err, 'releases');
  }
}

export async function GET(req: NextRequest) {
  const who = await caller(req);
  if ('error' in who) return who.error;
  const sha = normalizeSha(req.nextUrl.searchParams.get('sha'));
  try {
    const ready = await getSupportTicketStore().listForAutomation('fix_ready', new Date().toISOString(), 200);
    const tickets = ready
      .filter((t) => !sha || shaMatches(t.automation?.fix.sha, sha))
      .map((t) => ({ id: t.id, tenantCode: t.tenantCode, subject: t.subject, sha: t.automation?.fix.sha ?? null, markedBy: t.automation?.fix.markedBy ?? '' }));
    return ok({ deployedSha: deployedSha(), tickets });
  } catch (err) {
    return storageFail(err, 'releases');
  }
}
