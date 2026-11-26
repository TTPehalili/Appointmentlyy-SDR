import { NextRequest, after } from 'next/server';
import { getServerSession } from '@/lib/server/session';
import { getAppBaseUrl } from '@/lib/authToken';
import { limitPerUser } from '@/lib/server/userRateLimit';
import { getSupportTicketStore, normalizeTicketId } from '@/lib/server/supportTickets';
import { fail, ok, storageFail } from '@/lib/server/supportTicketsHttp';
import { requestRetriage, runTriageNow } from '@/lib/server/supportAutomation';

/**
 * POST /api/tickets/[id]/triage   (Appointmentlyy staff only; anyone else gets "not found")
 *   "Run AI triage again" on a ticket whose AI triage failed: back to pending with the tries starting over, then
 *   triaged right after the response (the AI daily caps still apply). Any other triage state: 409.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(req);
  if (!session) return fail(401, 'Please sign in again.');
  if (!session.isPlatformAdmin) return fail(404, 'Ticket not found');
  // Cookie-authenticated: refuse a browser request from another site.
  const site = req.headers.get('sec-fetch-site');
  const origin = req.headers.get('origin');
  // Behind Railway's proxy req.nextUrl.origin is the internal address, so also accept the host the browser actually
  // used (the app is served on its old railway.app address as well as the custom domain).
  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').split(',')[0].trim().toLowerCase();
  const o = (origin || '').toLowerCase();
  const sameHost = !!host && (o === `https://${host}` || o === `http://${host}`);
  if ((site && site !== 'same-origin' && site !== 'none') || (origin && !sameHost && origin !== req.nextUrl.origin && origin !== getAppBaseUrl())) return fail(403, 'Request refused.');
  const limited = limitPerUser('tickets-retriage', session, { maxRequests: 20, windowMs: 600_000 });
  if (limited) return limited;
  const id = normalizeTicketId((await context.params).id);
  if (!id) return fail(404, 'Ticket not found');
  try {
    const t = await requestRetriage(id, session.name || session.email);
    if (!t) return (await getSupportTicketStore().get(id)) ? fail(409, 'Only a ticket whose AI triage failed can be triaged again.') : fail(404, 'Ticket not found');
    after(() => runTriageNow(id));
    return ok({ ticket: t });
  } catch (err) {
    return storageFail(err, 'retriage');
  }
}
