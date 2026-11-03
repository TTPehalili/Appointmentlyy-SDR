import { NextRequest, NextResponse } from 'next/server';
import {
  readStoredTicketsServer,
  writeStoredTicketsServer,
  generateTicketId,
  TroubleTicket,
} from '@/lib/ticketStore';
import {
  sendAppointmentlyySystemInvoiceEmail,
  sendAdminTicketAlert,
} from '@/lib/ticketEmailer';

/**
 * POST /api/intelligence/topup
 *
 * Handles both:
 * 1. Client Self-Serve Quota Tap-Up (+2,000 / $50, +5,000 / $75, +10,000 / $150)
 * 2. Super Admin Manual Invoice Generation & Email Dispatch (e.g. $2,500 Month 1 Onboarding,
 *    $249/mo Month 2+ Renewal, or Custom Invoices)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      invoiceNumber: customInvNumber,
      tenantName = 'Appointmentlyy Client Workspace',
      tenantCode = 'APEX-GLOBAL',
      clientContactName = 'Account Administrator',
      clientEmail,
      scenario = 'icp_topup', // 'onboarding_month1' | 'renewal_month2' | 'icp_topup' | 'custom'
      recordsToCredit = 5000,
      totalAmountUsd = 75,
      issueDate: customIssueDate,
      dueDate: customDueDate,
      lineItems: customLineItems,
      createSupportTicket = true,
      notes = '',
    } = body;

    if (!clientEmail || !String(clientEmail).includes('@')) {
      return NextResponse.json(
        { error: 'A valid recipient email address is required to send the invoice.' },
        { status: 400 }
      );
    }

    const now = new Date();
    const formattedDate =
      customIssueDate ||
      now.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    const dueStr = customDueDate || formattedDate;
    const invNum =
      customInvNumber ||
      `INV-2026-${Math.floor(1000 + Math.random() * 8999)}`;

    const lineItems: { description: string; subtext?: string; amountUsd: number }[] =
      Array.isArray(customLineItems) && customLineItems.length > 0
        ? customLineItems
        : [
            {
              description: `ICP Data Cloud Quota Tap-Up — +${Number(recordsToCredit).toLocaleString()} Verified Records`,
              subtext:
                'Additional verified B2B decision-maker records credited upon confirmation',
              amountUsd: Number(totalAmountUsd),
            },
          ];

    let createdTicketId: string | undefined;

    if (createSupportTicket) {
      const ticketId = generateTicketId();
      createdTicketId = ticketId;
      const nowIso = now.toISOString();

      const ticketSubject =
        scenario === 'onboarding_month1'
          ? `[${invNum}] New Client Signup Invoice ($${Number(totalAmountUsd).toLocaleString()} USD) — ${tenantName}`
          : scenario === 'renewal_month2'
          ? `[${invNum}] Month 2+ Subscription & ICP Volume ($${Number(totalAmountUsd).toLocaleString()} USD) — ${tenantName}`
          : `[${invNum}] ICP Quota Tap-Up: +${Number(recordsToCredit).toLocaleString()} Records ($${Number(totalAmountUsd).toLocaleString()} USD) — ${tenantName}`;

      const ticketDescription = [
        `Official System Invoice Generated: ${invNum}`,
        `Workspace: ${tenantName} (${tenantCode})`,
        `Billed To: ${clientContactName} <${clientEmail}>`,
        `Total Amount Due: $${Number(totalAmountUsd).toFixed(2)} USD`,
        `Records to Provision on Payment: +${Number(recordsToCredit).toLocaleString()} Verified Records`,
        `Wise Payment Link: https://wise.com/pay/me/emilhalilih (Tag: @emilhalilih)`,
        notes ? `Notes: ${notes}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const newTicket: TroubleTicket = {
        id: ticketId,
        tenantName: String(tenantName).trim(),
        tenantCode: String(tenantCode).trim(),
        requesterName: String(clientContactName).trim(),
        requesterEmail: String(clientEmail).trim().toLowerCase(),
        subject: ticketSubject,
        description: ticketDescription,
        category: 'account_billing',
        priority: 'high',
        status: 'open',
        affectedUrl: '/icp-builder',
        assignedTo: 'Emil Halili',
        createdAt: nowIso,
        updatedAt: nowIso,
        messages: [
          {
            id: `msg_${ticketId.toLowerCase().replace(/[^a-z0-9]/g, '_')}_01`,
            ticketId,
            senderName: String(clientContactName).trim(),
            senderEmail: String(clientEmail).trim().toLowerCase(),
            senderRole: 'customer',
            isInternalNote: false,
            content: ticketDescription,
            createdAt: nowIso,
          },
        ],
      };

      const existingTickets = readStoredTicketsServer();
      writeStoredTicketsServer([newTicket, ...existingTickets]);
      sendAdminTicketAlert(newTicket).catch(() => {});
    }

    const emailResult = await sendAppointmentlyySystemInvoiceEmail({
      invoiceNumber: invNum,
      tenantName: String(tenantName).trim(),
      clientContactName: String(clientContactName).trim(),
      clientEmail: String(clientEmail).trim(),
      issueDate: formattedDate,
      dueDate: dueStr,
      totalAmountUsd: Number(totalAmountUsd),
      lineItems,
      ticketId: createdTicketId,
    });

    return NextResponse.json({
      success: true,
      invoiceNumber: invNum,
      issueDate: formattedDate,
      dueDate: dueStr,
      ticketId: createdTicketId,
      wiseUrl: 'https://wise.com/pay/me/emilhalilih',
      wiseTag: '@emilhalilih',
      wiseQrPath: '/images/wise-qr-emilhalilih.jpg',
      emailDispatched: emailResult.success,
      emailNote: emailResult.error || 'Invoice email dispatched via Resend',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to generate invoice';
    console.error('[/api/intelligence/topup POST error]:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
