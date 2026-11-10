import { NextRequest, NextResponse } from 'next/server';
import { readStoredTicketsServer, writeStoredTicketsServer, TroubleTicket } from '@/lib/ticketStore';
import { getServerSession } from '@/lib/server/session';
import { scopeTicketsFor } from '@/lib/server/ticketScope';

/**
 * GET /api/tickets/[id]
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(req);
    if (!session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    const { id } = await context.params;
    const tickets = scopeTicketsFor(readStoredTicketsServer(), session);
    const ticket = tickets.find(t => t.id.toLowerCase() === id.toLowerCase());

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, ticket });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error fetching ticket';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

/**
 * PATCH /api/tickets/[id]
 * Updates status, priority, or assignedTo
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Status, priority and assignment are managed by Appointmentlyy support staff.
    const session = await getServerSession(req);
    if (!session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    if (!session.isPlatformAdmin) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    const { id } = await context.params;
    const body = await req.json();
    const { status, priority, assignedTo } = body;
    const updatedBy = session.name;

    const tickets = readStoredTicketsServer();
    const ticketIndex = tickets.findIndex(t => t.id.toLowerCase() === id.toLowerCase());

    if (ticketIndex === -1) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const currentTicket = tickets[ticketIndex];
    const now = new Date().toISOString();
    const auditLogs: string[] = [];

    if (status && status !== currentTicket.status) {
      auditLogs.push(`Status changed from "${currentTicket.status}" to "${status}" by ${updatedBy}`);
    }
    if (priority && priority !== currentTicket.priority) {
      auditLogs.push(`Priority changed from "${currentTicket.priority}" to "${priority}" by ${updatedBy}`);
    }
    if (assignedTo && assignedTo !== currentTicket.assignedTo) {
      auditLogs.push(`Assigned to "${assignedTo}" by ${updatedBy}`);
    }

    const newMessages = [...currentTicket.messages];
    if (auditLogs.length > 0) {
      newMessages.push({
        id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        ticketId: currentTicket.id,
        senderName: 'System',
        senderEmail: 'system@appointmentlyy.com',
        senderRole: 'system',
        isInternalNote: false,
        content: auditLogs.join('. '),
        createdAt: now,
      });
    }

    const updatedTicket: TroubleTicket = {
      ...currentTicket,
      status: status || currentTicket.status,
      priority: priority || currentTicket.priority,
      assignedTo: assignedTo || currentTicket.assignedTo,
      resolvedAt: status === 'resolved' ? (currentTicket.resolvedAt || now) : (status ? undefined : currentTicket.resolvedAt),
      updatedAt: now,
      messages: newMessages,
    };

    tickets[ticketIndex] = updatedTicket;
    writeStoredTicketsServer(tickets);

    return NextResponse.json({ success: true, ticket: updatedTicket });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error updating ticket';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
