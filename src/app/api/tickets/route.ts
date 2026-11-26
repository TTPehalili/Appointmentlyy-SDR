import { NextRequest, after } from 'next/server';
import { getServerSession } from '@/lib/server/session';
import { limitPerUser } from '@/lib/server/userRateLimit';
import { getSupportTicketStore, type NewTicketInput } from '@/lib/server/supportTickets';
import { canViewTicket, ticketScopeFor, ticketViewFor } from '@/lib/server/ticketScope';
import { cleanText, fail, ok, readJsonObject, sendLater, storageFail, viewerOf } from '@/lib/server/supportTicketsHttp';
import { sendAdminTicketAlert, sendCustomerTicketConfirmation } from '@/lib/ticketEmailer';
import { scheduleScreenshotRetention } from '@/lib/server/supportShotQuota';
import { kickChecks, runTriage } from '@/lib/server/supportAutomation';
import {
  SUPPORT_AREAS,
  SUPPORT_LIMITS,
  URGENCY_OPTIONS,
  URGENCY_PRIORITY,
  cleanSupportContext,
  guessArea,
  isSupportArea,
  type TicketUrgency,
} from '@/lib/supportReport';
import { TICKET_CATEGORY_VALUES, TICKET_PRIORITIES, TICKET_STATUSES, type TicketCategory, type TicketPriority, type TicketStatus } from '@/lib/ticketTypes';
import { EMAIL_RE, TENANT_CODE_RE } from '@/lib/roles';

/** A report (text + captured context) is small; screenshots go up separately, one per request. */
const MAX_BODY = 96 * 1024;
const LIST_LIMIT = 200;

/**
 * GET /api/tickets?status=&priority=&tenant=&search=&mine=1
 * The tickets this person may see (ticketScope.ts): staff every workspace, Supervisor+ their workspace, Reps their own.
 * Every filter only narrows that list.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return fail(401, 'Please sign in again.');
  const limited = limitPerUser('tickets-read', session, { maxRequests: 120 });
  if (limited) return limited;
  scheduleScreenshotRetention(); // at most hourly, after the response (supportShotQuota.ts)
  // Support step 2: the staff queue also nudges the SLA / release checks (at most once a minute; the worker runs them anyway).
  if (session.isPlatformAdmin) after(() => kickChecks());
  const viewer = viewerOf(session);
  const sp = req.nextUrl.searchParams;
  const status = sp.get('status') || '';
  const priority = sp.get('priority') || '';
  const tenant = (sp.get('tenant') || '').trim().slice(0, 100);
  const search = (sp.get('search') || '').trim().toLowerCase().slice(0, 100);
  const mine = sp.get('mine') === '1';
  const tenantCode = tenant && tenant !== 'all' && TENANT_CODE_RE.test(tenant.toUpperCase()) ? tenant.toUpperCase() : undefined;
  const badStatus = !!status && status !== 'all' && !TICKET_STATUSES.includes(status as TicketStatus);
  const badPriority = !!priority && priority !== 'all' && !TICKET_PRIORITIES.includes(priority as TicketPriority);
  if (badStatus || badPriority) return ok({ count: 0, tickets: [] });
  try {
    let tickets = await getSupportTicketStore().list(ticketScopeFor(viewer), {
      status: TICKET_STATUSES.includes(status as TicketStatus) ? (status as TicketStatus) : undefined,
      priority: TICKET_PRIORITIES.includes(priority as TicketPriority) ? (priority as TicketPriority) : undefined,
      tenantCode: session.isPlatformAdmin ? tenantCode : undefined,
      requesterEmail: mine ? session.email : undefined,
      limit: LIST_LIMIT,
    });
    // Belt and braces: the scope is in the query; check every row again before it leaves.
    tickets = tickets.filter((t) => canViewTicket(t, viewer));
    if (tenant && tenant !== 'all') {
      const q = tenant.toLowerCase();
      tickets = tickets.filter((t) => t.tenantCode.toLowerCase() === q || t.tenantName.toLowerCase() === q);
    }
    if (search) {
      tickets = tickets.filter((t) =>
        [t.id, t.subject, t.description, t.tenantName, t.requesterName, t.requesterEmail].some((f) => (f || '').toLowerCase().includes(search)),
      );
    }
    const out = tickets.map((t) => ticketViewFor(t, viewer));
    return ok({ count: out.length, tickets: out });
  } catch (err) {
    return storageFail(err, 'list');
  }
}

/**
 * POST /api/tickets  (JSON)
 * File a report. Workspace, requester and role always come from the session; Appointmentlyy staff may file on a
 * client's behalf (requesterName / requesterEmail). Screenshots follow with POST /api/tickets/[id]/attachments.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return fail(401, 'Please sign in again.');
  const limited = limitPerUser('tickets-create', session, { maxRequests: SUPPORT_LIMITS.reportsPerHour, windowMs: 3_600_000 });
  if (limited) return limited;
  const body = await readJsonObject(req, MAX_BODY);
  if (body === 'too_large') return fail(413, 'That report is too long. Please shorten it and try again.');
  if (!body) return fail(400, 'That report could not be read. Please try again.');

  const description = cleanText(body.whatHappened ?? body.description, SUPPORT_LIMITS.whatHappened);
  if (!description) return fail(400, 'Please tell us what happened.');
  const tried = cleanText(body.tried, SUPPORT_LIMITS.tried);
  const urgency: TicketUrgency | null = URGENCY_OPTIONS.some((o) => o.value === body.urgency) ? (body.urgency as TicketUrgency) : null;
  const context = cleanSupportContext(body.context);
  const area = isSupportArea(body.area) ? body.area : guessArea(context.page.path);
  const category: TicketCategory = TICKET_CATEGORY_VALUES.includes(body.category as TicketCategory)
    ? (body.category as TicketCategory)
    : SUPPORT_AREAS.find((a) => a.value === area)?.category ?? 'bug_general';
  const priority: TicketPriority = urgency
    ? URGENCY_PRIORITY[urgency]
    : TICKET_PRIORITIES.includes(body.priority as TicketPriority)
      ? (body.priority as TicketPriority)
      : 'medium';
  const firstLine = description.split('\n').find((l) => l.trim()) || description;
  const subject = cleanText(body.subject, SUPPORT_LIMITS.subject, false) || cleanText(firstLine, SUPPORT_LIMITS.subject, false);

  // Who and where: the session. Staff may name the client they are filing for.
  let requesterEmail = session.email.toLowerCase();
  let requesterName = session.name;
  let filedByEmail: string | null = null;
  if (session.isPlatformAdmin && typeof body.requesterEmail === 'string' && body.requesterEmail.trim()) {
    const e = body.requesterEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(e) || e.length > 254) return fail(400, 'A valid requester email address is required.');
    if (e !== requesterEmail) {
      filedByEmail = requesterEmail;
      requesterEmail = e;
      requesterName = cleanText(body.requesterName, 120, false) || e;
    }
  }
  context.workspace = session.tenantCode;
  context.role = filedByEmail ? '' : session.role;
  context.receivedAt = new Date().toISOString();
  context.serverVersion = (process.env.NEXT_PUBLIC_APP_VERSION || '').slice(0, 80);

  const input: NewTicketInput = {
    tenantCode: session.tenantCode,
    tenantName: session.identity.tenant.name.slice(0, 200),
    requesterEmail,
    requesterName: requesterName.slice(0, 200),
    requesterRole: filedByEmail ? '' : session.role,
    filedByEmail,
    subject,
    description,
    tried,
    area,
    urgency,
    category,
    priority,
    source: session.isPlatformAdmin && body.source === 'desk' ? 'desk' : 'report',
    context,
    assignedTo: 'Appointmentlyy support',
  };
  const screenshots = Math.min(SUPPORT_LIMITS.screenshots, Math.max(0, Math.floor(Number(body.screenshots) || 0)));
  try {
    const ticket = await getSupportTicketStore().create(input, {
      senderName: input.requesterName,
      senderEmail: requesterEmail,
      senderRole: 'customer',
      isInternalNote: false,
      content: description,
    });
    console.log(`[tickets] created ${ticket.id} in ${ticket.tenantCode} (${urgency || priority})`);
    // Email never decides whether the report was filed.
    sendLater('confirmation', () => sendCustomerTicketConfirmation(ticket));
    sendLater('alert', () => sendAdminTicketAlert(ticket, { screenshots }));
    // Support step 2: straight to the AI, after the response; it never blocks or fails the report (supportAutomation.ts).
    after(() => runTriage(ticket.id));
    return ok({ ticket: ticketViewFor(ticket, viewerOf(session)), uploadUrl: `/api/tickets/${ticket.id}/attachments` }, 201);
  } catch (err) {
    return storageFail(err, 'create');
  }
}
