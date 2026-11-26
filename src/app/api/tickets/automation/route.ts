import { NextRequest } from 'next/server';
import { getServerSession } from '@/lib/server/session';
import { limitPerUser } from '@/lib/server/userRateLimit';
import { getSupportTicketStore } from '@/lib/server/supportTickets';
import { fail, ok, readJsonObject, storageFail } from '@/lib/server/supportTicketsHttp';
import { automationStatus, runChecks, sendResolvedNow } from '@/lib/server/supportAutomation';
import { normalizeSha } from '@/lib/supportAutomation';

/**
 * Platform › Support automation panel (Appointmentlyy staff only; anyone else gets "not found").
 *   GET                                   -> switches, AI use today, deployed commit, Fix ready tickets, last check
 *   PATCH { aiTriage?, autoEmails?, aiDailyCap? (number | null) }  -> the platform switches (the server's env "off" still wins)
 *   POST  { action: 'check' }             -> run the SLA / release / stuck-triage checks now
 *   POST  { action: 'send', sha? }        -> "Send resolved replies now": every Fix ready ticket (or those linked to sha)
 */
async function staff(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return { error: fail(401, 'Please sign in again.') };
  if (!session.isPlatformAdmin) return { error: fail(404, 'Not found') };
  const limited = limitPerUser('tickets-automation', session, { maxRequests: 60, windowMs: 60_000 });
  if (limited) return { error: limited };
  return { session };
}

export async function GET(req: NextRequest) {
  const s = await staff(req);
  if (s.error) return s.error;
  try {
    return ok({ status: await automationStatus() });
  } catch (err) {
    return storageFail(err, 'automation status');
  }
}

export async function PATCH(req: NextRequest) {
  const s = await staff(req);
  if (s.error) return s.error;
  const body = await readJsonObject(req, 4 * 1024);
  if (!body || body === 'too_large') return fail(400, 'That change could not be read.');
  const patch: { aiTriage?: boolean; autoEmails?: boolean; aiDailyCap?: number | null } = {};
  if (body.aiTriage !== undefined) {
    if (typeof body.aiTriage !== 'boolean') return fail(400, 'aiTriage must be true or false.');
    patch.aiTriage = body.aiTriage;
  }
  if (body.autoEmails !== undefined) {
    if (typeof body.autoEmails !== 'boolean') return fail(400, 'autoEmails must be true or false.');
    patch.autoEmails = body.autoEmails;
  }
  if (body.aiDailyCap !== undefined) {
    const n = body.aiDailyCap;
    if (n !== null && !(typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 100_000)) return fail(400, 'The daily AI limit must be a whole number from 0 to 100000 (or empty for the default).');
    patch.aiDailyCap = n as number | null;
  }
  try {
    await getSupportTicketStore().saveSettings(patch, s.session!.email);
    console.info(`[support-auto] settings changed by ${s.session!.email}: ${JSON.stringify(patch)}`);
    return ok({ status: await automationStatus() });
  } catch (err) {
    return storageFail(err, 'automation settings');
  }
}

export async function POST(req: NextRequest) {
  const s = await staff(req);
  if (s.error) return s.error;
  const body = await readJsonObject(req, 4 * 1024);
  if (!body || body === 'too_large') return fail(400, 'That request could not be read.');
  try {
    if (body.action === 'check') return ok({ result: await runChecks(`asked by ${s.session!.email}`), status: await automationStatus() });
    if (body.action === 'send') {
      let sha: string | null = null;
      if (body.sha !== undefined && body.sha !== null && String(body.sha).trim() !== '') {
        sha = normalizeSha(body.sha);
        if (!sha) return fail(400, 'The release must be a git commit id (7 to 40 letters a-f and digits).');
      }
      const run = await sendResolvedNow({ sha, by: s.session!.name || s.session!.email });
      return ok({ run, status: await automationStatus() });
    }
    return fail(400, 'Unknown action.');
  } catch (err) {
    return storageFail(err, 'automation');
  }
}
