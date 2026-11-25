import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/server/session';
import { getSupportTicketStore } from '@/lib/server/supportTickets';
import { getTenantStore } from '@/lib/server/tenantStore';
import { sendLater } from '@/lib/server/supportTicketsHttp';
import { limitPerUser } from '@/lib/server/userRateLimit';
import {
  sendAppointmentlyySystemInvoiceEmail,
  sendAdminTicketAlert,
} from '@/lib/ticketEmailer';
import { readInvoiceTextFromRequest, DEFAULT_INVOICE_TEXT } from '@/lib/invoiceText';

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
    const session = await getServerSession(req);
    if (!session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    const raw = await req.json();
    // Clients can only top up their own workspace, invoiced to themselves. Staff can invoice anyone.
    const body = session.isPlatformAdmin
      ? raw
      : {
          ...raw,
          tenantName: session.identity.tenant.name,
          tenantCode: session.tenantCode,
          clientContactName: session.name,
          clientEmail: session.email,
          scenario: 'icp_topup',
          invoiceNumber: undefined,
          lineItems: undefined,
          issueDate: undefined,
          dueDate: undefined,
          // Clients' own top-ups always carry the standard invoice text.
          invoiceNote: undefined,
          refundPolicy: undefined,
          paymentInstructions: undefined,
          inquiriesEmail: undefined,
        };
    if (!session.isPlatformAdmin && raw?.scenario && raw.scenario !== 'icp_topup') {
      return NextResponse.json({ error: 'Only Appointmentlyy staff can issue that invoice.' }, { status: 403 });
    }
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

    // The note, policy, payment line and inquiries email (staff only; clients get the standard text).
    // Cleaned and capped here; the email escapes every one of them.
    const invoiceText = session.isPlatformAdmin
      ? readInvoiceTextFromRequest({
          note: body.invoiceNote,
          refundPolicy: body.refundPolicy,
          paymentInstructions: body.paymentInstructions,
          inquiriesEmail: body.inquiriesEmail,
        })
      : DEFAULT_INVOICE_TEXT;
    if (!invoiceText) {
      return NextResponse.json({ error: 'Enter a valid email address for inquiries.' }, { status: 400 });
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

    // A billing ticket (and its alert to support) per request: clients get a few an hour, like "Report a problem", so
    // this route cannot be used to flood the support inbox or the tickets table. Past that the invoice still goes out.
    const ticketAllowed =
      session.isPlatformAdmin || !limitPerUser('billing-topup-ticket', session, { maxRequests: 6, windowMs: 3_600_000 });

    if (createSupportTicket && ticketAllowed) {
      const ticketSubject =
        scenario === 'gtm_plan'
          ? `[${invNum}] GTM Plan Invoice ($${Number(totalAmountUsd).toLocaleString()} USD) — ${tenantName}`
          : scenario === 'onboarding_month1'
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
        notes ? `Notes: ${String(notes).slice(0, 1000)}` : '',
      ]
        .filter(Boolean)
        .join('\n')
        .slice(0, 4000);

      // The billing ticket lives in a real workspace: the client's own, or (staff) the one named if it exists.
      const named = String(tenantCode || '').trim().toUpperCase();
      const ticketTenant =
        !session.isPlatformAdmin || named === session.tenantCode
          ? session.identity.tenant
          : (await getTenantStore().getTenant(named).catch(() => null)) ?? session.identity.tenant;
      const requesterEmail = String(clientEmail).trim().toLowerCase().slice(0, 254);
      const requesterName = String(clientContactName).trim().slice(0, 200);
      try {
        const ticket = await getSupportTicketStore().create(
          {
            tenantCode: ticketTenant.code,
            tenantName: ticketTenant.name.slice(0, 200),
            requesterEmail,
            requesterName,
            requesterRole: session.isPlatformAdmin ? '' : session.role,
            filedByEmail: session.isPlatformAdmin && requesterEmail !== session.email ? session.email : null,
            subject: ticketSubject.replace(/\s+/g, ' ').slice(0, 160),
            description: ticketDescription,
            tried: '',
            area: 'billing',
            urgency: null,
            category: 'account_billing',
            priority: 'high',
            source: 'billing',
            context: null,
            assignedTo: 'Appointmentlyy support',
          },
          { senderName: requesterName, senderEmail: requesterEmail, senderRole: 'customer', isInternalNote: false, content: ticketDescription },
        );
        createdTicketId = ticket.id;
        sendLater('billing alert', () => sendAdminTicketAlert(ticket));
      } catch (err) {
        // The invoice still goes out; the ticket is a convenience.
        console.warn('[/api/intelligence/topup] billing ticket not saved:', err instanceof Error ? err.message : err);
      }
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
      text: invoiceText,
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

