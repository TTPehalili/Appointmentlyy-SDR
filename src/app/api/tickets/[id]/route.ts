import { NextRequest } from 'next/server';
import { getServerSession } from '@/lib/server/session';
import { limitPerUser } from '@/lib/server/userRateLimit';
import { getSupportTicketStore, normalizeTicketId, type TicketPatch } from '@/lib/server/supportTickets';
import { canViewTicket, ticketViewFor } from '@/lib/server/ticketScope';
import { cleanText, fail, ok, readJsonObject, storageFail, viewerOf } from '@/lib/server/supportTicketsHttp';
import { followPriority } from '@/lib/server/supportAutomation';
import { STATUS_LABEL, TICKET_PRIORITIES, TICKET_STATUSES, type TicketPriority, type TicketStatus } from '@/lib/ticketTypes';

/**
 * GET /api/tickets/[id]
 * One ticket, if this person may see it (ticketScope.ts); anything else is "not found".
 */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(req);
  if (!session) return fail(401, 'Please sign in again.');
  const limited = limitPerUser('tickets-read', session, { maxRequests: 120 });
  if (limited) return limited;
  const id = normalizeTicketId((await context.params).id);
  if (!id) return fail(404, 'Ticket not found');
  try {
    const t = await getSupportTicketStore().get(id);
    const viewer = viewerOf(session);
    if (!t || !canViewTicket(t, viewer)) return fail(404, 'Ticket not found');
    return ok({ ticket: ticketViewFor(t, viewer) });
  } catch (err) {
    return storageFail(err, 'get');
  }
}

/**
 * PATCH /api/tickets/[id]  { status?, priority?, assignedTo? }
 * Appointmentlyy support staff only. Each change leaves a short system note on the conversation.
 */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(req);
  if (!session) return fail(401, 'Please sign in again.');
  if (!session.isPlatformAdmin) return fail(404, 'Ticket not found');
  const id = normalizeTicketId((await context.params).id);
  if (!id) return fail(404, 'Ticket not found');
  const body = await readJsonObject(req, 8 * 1024);
  if (!body || body === 'too_large') return fail(400, 'That change could not be read.');
  const patch: TicketPatch = {};
  if (body.status !== undefined) {
    if (!TICKET_STATUSES.includes(body.status as TicketStatus)) return fail(400, 'Unknown status.');
    patch.status = body.status as TicketStatus;
  }
  if (body.priority !== undefined) {
    if (!TICKET_PRIORITIES.includes(body.priority as TicketPriority)) return fail(400, 'Unknown priority.');
    patch.priority = body.priority as TicketPriority;
  }
  if (body.assignedTo !== undefined) patch.assignedTo = cleanText(body.assignedTo, 120, false);
  try {
    const store = getSupportTicketStore();
    const cur = await store.get(id);
    if (!cur) return fail(404, 'Ticket not found');
    const notes: string[] = [];
    if (patch.status && patch.status !== cur.status) notes.push(`Status changed from ${STATUS_LABEL[cur.status]} to ${STATUS_LABEL[patch.status]} by ${session.name}`);
    if (patch.priority && patch.priority !== cur.priority) notes.push(`Priority changed from ${cur.priority} to ${patch.priority} by ${session.name}`);
    if (patch.assignedTo !== undefined && patch.assignedTo !== (cur.assignedTo || '')) notes.push(`Assigned to ${patch.assignedTo || 'nobody'} by ${session.name}`);
    const t = await store.update(
      id,
      patch,
      notes.length ? { senderName: 'System', senderEmail: 'system@appointmentlyy.com', senderRole: 'system', isInternalNote: false, content: notes.join('. ').slice(0, 4000) } : null,
    );
    if (!t) return fail(404, 'Ticket not found');
    // Support step 2: a new priority moves the severity and the SLA target with it.
    if (patch.priority && patch.priority !== cur.priority) {
      await followPriority(t, session.name);
      return ok({ ticket: (await store.get(id)) ?? t });
    }
    return ok({ ticket: t });
  } catch (err) {
    return storageFail(err, 'update');
  }
}
