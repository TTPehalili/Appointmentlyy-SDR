import { NextRequest, NextResponse } from 'next/server';
import { 
  readStoredTicketsServer, 
  writeStoredTicketsServer, 
  generateTicketId, 
  TroubleTicket, 
  TicketPriority, 
  TicketCategory 
} from '@/lib/ticketStore';
import { 
  sendCustomerTicketConfirmation, 
  sendAdminTicketAlert 
} from '@/lib/ticketEmailer';
import { getServerSession } from '@/lib/server/session';
import { scopeTicketsFor } from '@/lib/server/ticketScope';


/**
 * GET /api/tickets
 * Query params: tenant, status, priority, search
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const tenantFilter = searchParams.get('tenant');
    const statusFilter = searchParams.get('status');
    const priorityFilter = searchParams.get('priority');
    const searchQuery = searchParams.get('search');

    let tickets = scopeTicketsFor(readStoredTicketsServer(), session);

    if (tenantFilter && tenantFilter !== 'all') {
      tickets = tickets.filter(t => 
        t.tenantName.toLowerCase() === tenantFilter.toLowerCase() || 
        (t.tenantCode && t.tenantCode.toLowerCase() === tenantFilter.toLowerCase())
      );
    }

    if (statusFilter && statusFilter !== 'all') {
      tickets = tickets.filter(t => t.status.toLowerCase() === statusFilter.toLowerCase());
    }

    if (priorityFilter && priorityFilter !== 'all') {
      tickets = tickets.filter(t => t.priority.toLowerCase() === priorityFilter.toLowerCase());
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      tickets = tickets.filter(t => 
        t.id.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tenantName.toLowerCase().includes(q) ||
        t.requesterName.toLowerCase().includes(q) ||
        t.requesterEmail.toLowerCase().includes(q)
      );
    }

    return NextResponse.json({
      success: true,
      count: tickets.length,
      tickets
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to fetch tickets';
    console.error('[API /api/tickets GET error]', errorMsg);
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tickets
 * Submits a new trouble ticket, persists it, and sends confirmation + alert emails.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    const body = await req.json();
    // Workspace and requester come from the session; staff may file on a client's behalf.
    const tenantName = session.identity.tenant.name;
    const tenantCode = session.tenantCode;
    const requesterName: string = session.isPlatformAdmin && body.requesterName ? String(body.requesterName) : session.name;
    const requesterEmail: string = session.isPlatformAdmin && body.requesterEmail ? String(body.requesterEmail) : session.email;
    const {
      subject,
      description,
      category = 'bug_general',
      priority = 'medium',
      affectedUrl,
      systemInfo,
    } = body;

    if (!subject || !subject.trim()) {
      return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
    }
    if (!description || !description.trim()) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }
    if (!requesterEmail || !requesterEmail.trim() || !requesterEmail.includes('@')) {
      return NextResponse.json({ error: 'A valid requester email address is required' }, { status: 400 });
    }

    const ticketId = generateTicketId();
    const now = new Date().toISOString();

    const initialMessage = {
      id: `msg_${ticketId.toLowerCase().replace(/[^a-z0-9]/g, '_')}_01`,
      ticketId: ticketId,
      senderName: requesterName.trim(),
      senderEmail: requesterEmail.trim().toLowerCase(),
      senderRole: 'customer' as const,
      isInternalNote: false,
      content: description.trim(),
      createdAt: now,
    };

    const newTicket: TroubleTicket = {
      id: ticketId,
      tenantName: tenantName.trim(),
      tenantCode: tenantCode?.trim(),
      requesterName: requesterName.trim(),
      requesterEmail: requesterEmail.trim().toLowerCase(),
      subject: subject.trim(),
      description: description.trim(),
      category: (category as TicketCategory) || 'bug_general',
      priority: (priority as TicketPriority) || 'medium',
      status: 'open',
      affectedUrl: affectedUrl?.trim() || undefined,
      systemInfo: systemInfo || undefined,
      assignedTo: 'Emil Halili',
      createdAt: now,
      updatedAt: now,
      messages: [initialMessage],
    };

    // 1. Persist to server store
    const existingTickets = readStoredTicketsServer();
    const updatedTickets = [newTicket, ...existingTickets.filter(t => t.id !== ticketId)];
    writeStoredTicketsServer(updatedTickets);

    console.log(`[TICKET CREATED] ID: ${ticketId} | Tenant: ${tenantName} | From: ${requesterEmail}`);

    // 2. Dispatch Confirmation Email to Customer and Alert Email to Admin
    let customerEmailResult: { success: boolean; messageId?: string; error?: string } = { success: false };
    let adminEmailResult: { success: boolean; messageId?: string; error?: string } = { success: false };

    try {
      // Send both concurrently to minimize latency
      const [custRes, adminRes] = await Promise.allSettled([
        sendCustomerTicketConfirmation(newTicket),
        sendAdminTicketAlert(newTicket),
      ]);

      if (custRes.status === 'fulfilled') {
        customerEmailResult = custRes.value;
      } else {
        console.warn('[Ticket Confirmation Error]', custRes.reason);
      }

      if (adminRes.status === 'fulfilled') {
        adminEmailResult = adminRes.value;
      } else {
        console.warn('[Admin Alert Error]', adminRes.reason);
      }
    } catch (emailErr) {
      console.warn('[Ticket Email Dispatch Notice]', emailErr);
    }

    return NextResponse.json({
      success: true,
      ticket: newTicket,
      emailsSent: {
        customerConfirmation: customerEmailResult.success,
        customerMessageId: customerEmailResult.messageId,
        adminAlert: adminEmailResult.success,
        adminMessageId: adminEmailResult.messageId,
      }
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to submit trouble ticket';
    console.error('[API /api/tickets POST error]', errorMsg);
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
