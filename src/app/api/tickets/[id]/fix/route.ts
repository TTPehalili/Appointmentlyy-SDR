import { NextRequest } from 'next/server';
import { getServerSession } from '@/lib/server/session';
import { limitPerUser } from '@/lib/server/userRateLimit';
import { getSupportTicketStore, normalizeTicketId } from '@/lib/server/supportTickets';
import { cleanText, fail, ok, readJsonObject, storageFail } from '@/lib/server/supportTicketsHttp';
import { cancelFix, draftResolution, markFixReady, sendResolvedNow } from '@/lib/server/supportAutomation';
import { normalizeSha } from '@/lib/supportAutomation';
import { SUPPORT_LIMITS } from '@/lib/supportReport';

/**
 * POST /api/tickets/[id]/fix   (Appointmentlyy staff only; anyone else gets "not found")
 *   { action: 'draft', notes? }              -> { draft, by: 'ai' | 'template' }  (nothing saved or sent)
 *   { action: 'save', sha?, reply?, draft? } -> "Fix ready": the reply goes out once release `sha` is live
 *                                               (no reply: AI draft when draft=true, else the template)
 *   { action: 'cancel' }                     -> back to no fix
 *   { action: 'send' }                       -> send this ticket's resolution reply now (the owner confirms the fix is live)
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(req);
  if (!session) return fail(401, 'Please sign in again.');
  if (!session.isPlatformAdmin) return fail(404, 'Ticket not found');
  const limited = limitPerUser('tickets-fix', session, { maxRequests: 60, windowMs: 600_000 });
  if (limited) return limited;
  const id = normalizeTicketId((await context.params).id);
  if (!id) return fail(404, 'Ticket not found');
  const body = await readJsonObject(req, 16 * 1024);
  if (!body || body === 'too_large') return fail(400, 'That request could not be read.');
  const by = session.name || session.email;
  try {
    const store = getSupportTicketStore();
    const t = await store.get(id);
    if (!t) return fail(404, 'Ticket not found');
    switch (body.action) {
      case 'draft': {
        const d = await draftResolution(t, cleanText(body.notes, 1500));
        return ok({ draft: d.reply, by: d.by, reason: d.reason ?? null });
      }
      case 'save': {
        let sha: string | null = null;
        if (body.sha !== undefined && body.sha !== null && String(body.sha).trim() !== '') {
          sha = normalizeSha(body.sha);
          if (!sha) return fail(400, 'The release must be a git commit id (7 to 40 letters a-f and digits).');
        }
        const r = await markFixReady(id, { sha, reply: cleanText(body.reply, SUPPORT_LIMITS.reply), by, draft: body.draft === true, notes: cleanText(body.notes, 1500) });
        if (!r.ok) return fail(r.status, r.error);
        return ok({ ticket: r.ticket, drafted: r.drafted });
      }
      case 'cancel': {
        const c = await cancelFix(id, by);
        if (!c) return fail(409, 'This ticket is not marked Fix ready.');
        return ok({ ticket: c });
      }
      case 'send': {
        if (t.automation?.fix.state !== 'fix_ready') return fail(409, 'Mark the ticket Fix ready (with its reply) first.');
        const run = await sendResolvedNow({ ids: [id], by });
        return ok({ run, ticket: await store.get(id) });
      }
      default:
        return fail(400, 'Unknown action.');
    }
  } catch (err) {
    return storageFail(err, 'fix');
  }
}
