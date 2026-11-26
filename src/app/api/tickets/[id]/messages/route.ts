import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { getServerSession } from '@/lib/server/session';
import { limitPerUser } from '@/lib/server/userRateLimit';
import { getSupportTicketStore, normalizeTicketId } from '@/lib/server/supportTickets';
import { canViewTicket, ticketViewFor } from '@/lib/server/ticketScope';
import { cleanText, fail, ok, readJsonObject, sendLater, storageFail, viewerOf } from '@/lib/server/supportTicketsHttp';
import { sendAdminTicketAlert, sendCustomerReplyNotification } from '@/lib/ticketEmailer';
import { SUPPORT_LIMITS } from '@/lib/supportReport';
import { reopenOnReply } from '@/lib/server/supportAutomation';
import type { TicketStatus } from '@/lib/ticketTypes';

/**
 * POST /api/tickets/[id]/messages  { content, isInternalNote? }
 * A reply on a ticket this person may see. Who is writing comes from the session: staff reply as support (and only
 * staff may leave internal notes), everyone else as the customer.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(req);
  if (!session) return fail(401, 'Please sign in again.');
  const limited = limitPerUser('tickets-reply', session, { maxRequests: SUPPORT_LIMITS.repliesPer10Min, windowMs: 600_000 });
  if (limited) return limited;
  const id = normalizeTicketId((await context.params).id);
  if (!id) return fail(404, 'Ticket not found');
  const body = await readJsonObject(req, 24 * 1024);
  if (body === 'too_large') return fail(413, 'That reply is too long. Please shorten it.');
  if (!body) return fail(400, 'That reply could not be read.');
  const content = cleanText(body.content, SUPPORT_LIMITS.reply);
  if (!content) return fail(400, 'Message content cannot be empty');
  const viewer = viewerOf(session);
  const senderRole: 'admin' | 'customer' = session.isPlatformAdmin ? 'admin' : 'customer';
  const isInternalNote = session.isPlatformAdmin && body.isInternalNote === true;
  try {
    const store = getSupportTicketStore();
    const cur = await store.get(id);
    if (!cur || !canViewTicket(cur, viewer)) return fail(404, 'Ticket not found');
    // A reply moves the ticket along: support answering an open ticket starts work; the customer answering a
    // "waiting on you" ticket hands it back.
    let status: TicketStatus | null = null;
    if (senderRole === 'admin' && !isInternalNote && cur.status === 'open') status = 'in_progress';
    if (senderRole === 'customer' && cur.status === 'waiting_on_customer') status = 'in_progress';
    // This message's own id: the reply returned and emailed below is exactly this one. ("The newest message" could be
    // someone else's, e.g. a staff internal note saved a moment later, and must never go to the customer.)
    const msgId = crypto.randomUUID();
    const msg = { id: msgId, senderName: session.name.slice(0, 200), senderEmail: session.email, senderRole, isInternalNote, content };
    let t = await store.addMessage(id, msg, status);
    if (!t) return fail(404, 'Ticket not found');
    // Support step 2: the reporter (or their workspace) answering a Resolved / Closed ticket reopens it for a person,
    // e.g. after an automatic how-to answer that did not help. Conditional, so a racing staff change wins.
    if (senderRole === 'customer' && (cur.status === 'resolved' || cur.status === 'closed')) t = (await reopenOnReply(t, session.name || session.email)) ?? t;
    const saved = t.messages.find((m) => m.id === msgId);
    if (!saved) return storageFail(new Error('saved reply not found on re-read'), 'reply');
    if (senderRole === 'admin' && !isInternalNote) sendLater('reply notification', () => sendCustomerReplyNotification(t, saved));
    if (senderRole === 'customer') sendLater('reply alert', () => sendAdminTicketAlert(t, { reply: saved }));
    const view = ticketViewFor(t, viewer);
    return ok({ message: saved, ticket: view });
  } catch (err) {
    return storageFail(err, 'reply');
  }
}
