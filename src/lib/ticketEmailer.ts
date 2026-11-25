/**
 * Trouble Ticket Email Dispatcher
 * 
 * Powered by Resend integration. Automatically handles:
 * 1. Customer Ticket Confirmation ("Ticket received & actively being worked on")
 * 2. Alert to the support inbox (support@appointmentlyy.com, or SUPPORT_ALERT_EMAIL)
 * 3. Customer Reply Notifications when Admin responds inside the SDR Ticket Dashboard
 */

import { getResendApiKey, getResendFromEmail, getResendInboundEmail } from '@/lib/resendConfig';
import type { TroubleTicket, TicketMessage } from '@/lib/ticketTypes';
import { getAppBaseUrl } from '@/lib/authToken';
import { EMAIL_RE } from '@/lib/roles';
import { areaLabel, urgencyLabel } from '@/lib/supportReport';

/** Where new-ticket alerts go: SUPPORT_ALERT_EMAIL, or support@appointmentlyy.com. */
export const SUPPORT_ALERT_EMAIL_DEFAULT = 'support@appointmentlyy.com';
export function supportAlertEmail(): string {
  const v = (process.env.SUPPORT_ALERT_EMAIL || '').trim().toLowerCase();
  return EMAIL_RE.test(v) && v.length <= 254 ? v : SUPPORT_ALERT_EMAIL_DEFAULT;
}

/** Subject lines: one line, capped (no header injection through a ticket subject). */
const oneLine = (s: string, max: number) => String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);

/** The requester's own view of a ticket: My reports on the Help page. */
const myReportsLink = (id: string) => `${getAppBaseUrl()}/help?report=${encodeURIComponent(id)}#my-reports`;

// Escape HTML special characters
function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getPriorityColor(priority: string): { bg: string; text: string; label: string } {
  switch (priority.toLowerCase()) {
    case 'urgent':
      return { bg: '#fee2e2', text: '#dc2626', label: 'URGENT (P1)' };
    case 'high':
      return { bg: '#ffedd5', text: '#ea580c', label: 'HIGH (P2)' };
    case 'medium':
      return { bg: '#dbeafe', text: '#2563eb', label: 'MEDIUM (P3)' };
    case 'low':
    default:
      return { bg: '#f3f4f6', text: '#4b5563', label: 'LOW (P4)' };
  }
}

/**
 * 1. Send confirmation email to Customer / Tenant
 */
export async function sendCustomerTicketConfirmation(ticket: TroubleTicket): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    console.warn('[TicketEmailer] No Resend API key configured. Skipping live customer email dispatch.');
    return { success: false, error: 'Resend API key not configured' };
  }

  const fromEmail = getResendFromEmail(); // e.g. "Emil Halili <emil@appointmentlyy.com>"
  const inboundEmail = getResendInboundEmail();
  const priorityInfo = getPriorityColor(ticket.priority);

  const subject = oneLine(`[${ticket.id}] Ticket Received: ${ticket.subject}`, 200);

  const textBody = `
Hi ${ticket.requesterName},

Thank you for contacting Appointmentlyy SDR Support. We have received your trouble ticket and our engineering team is actively investigating and working on a resolution.

TICKET SUMMARY:
- Reference ID: ${ticket.id}
- Subject: ${ticket.subject}
- Workspace / Tenant: ${ticket.tenantName}
- Priority: ${priorityInfo.label}
- Status: In Progress (Assigned to Engineering)

DESCRIPTION:
${ticket.description}

You can view live updates and communicate directly with our team in your Appointmentlyy SDR Support Dashboard:
${myReportsLink(ticket.id)}

We will notify you the moment an update or fix is deployed.

Best regards,
Emil Halili & The Appointmentlyy Engineering Team
support@appointmentlyy.com
`.trim();

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Trouble Ticket Confirmation</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #18181b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e4e4e7;">
          
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #18181b; padding: 24px 32px; border-bottom: 3px solid #ED1C24;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="display: inline-block; background-color: #ED1C24; color: #ffffff; font-weight: 800; font-size: 14px; padding: 4px 10px; border-radius: 6px; letter-spacing: 0.5px;">APPOINTMENTLYY</span>
                    <span style="color: #a1a1aa; font-size: 13px; font-weight: 600; margin-left: 8px;">SDR SUPPORT DESK</span>
                  </td>
                  <td align="right">
                    <span style="font-family: monospace; font-size: 12px; color: #f4f4f5; background-color: #27272a; padding: 4px 8px; border-radius: 4px;">${escapeHtml(ticket.id)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding: 32px;">
              <div style="font-size: 18px; font-weight: 700; color: #18181b; margin-bottom: 8px;">
                We've received your trouble ticket
              </div>
              <p style="font-size: 14px; line-height: 1.6; color: #52525b; margin: 0 0 24px 0;">
                Hi <strong>${escapeHtml(ticket.requesterName)}</strong>, thank you for reaching out. We have logged your request into our priority triage queue. Our team is actively reviewing your issue and working on a resolution.
              </p>

              <!-- Ticket Info Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fafafa; border: 1px solid #e4e4e7; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #f4f4f5;">
                    <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #71717a; letter-spacing: 0.5px;">Subject</div>
                    <div style="font-size: 15px; font-weight: 600; color: #18181b; margin-top: 4px;">${escapeHtml(ticket.subject)}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 20px; border-bottom: 1px solid #f4f4f5;">
                    <table width="100%">
                      <tr>
                        <td width="33%">
                          <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #71717a;">Priority</div>
                          <span style="display: inline-block; margin-top: 4px; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; background-color: ${priorityInfo.bg}; color: ${priorityInfo.text};">
                            ${priorityInfo.label}
                          </span>
                        </td>
                        <td width="33%">
                          <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #71717a;">Workspace</div>
                          <div style="font-size: 12px; font-weight: 600; color: #27272a; margin-top: 4px;">${escapeHtml(ticket.tenantName)}</div>
                        </td>
                        <td width="33%">
                          <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #71717a;">Status</div>
                          <span style="display: inline-block; margin-top: 4px; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; background-color: #dbeafe; color: #1e40af;">
                            IN PROGRESS
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px;">
                    <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #71717a; margin-bottom: 6px;">Reported Details</div>
                    <div style="font-size: 13px; line-height: 1.6; color: #3f3f46; white-space: pre-wrap; background-color: #ffffff; padding: 12px; border-radius: 6px; border: 1px solid #e4e4e7;">${escapeHtml(ticket.description)}</div>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 28px 0 16px 0;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(myReportsLink(ticket.id))}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 12px 28px; font-size: 13px; font-weight: 600; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                      Open Ticket in SDR Dashboard &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size: 12px; line-height: 1.5; color: #71717a; text-align: center; margin: 0;">
                You can also reply directly to this email or communicate live in your dashboard.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #fafafa; padding: 20px 32px; border-top: 1px solid #e4e4e7; text-align: center; font-size: 11px; color: #a1a1aa;">
              Appointmentlyy SDR Inc. &bull; Enterprise SLA Operations &bull; Emil Halili, CEO/Founder<br>
              Brisbane &bull; Manila &bull; Global Telecom Cloud
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [ticket.requesterEmail],
        subject: subject,
        text: textBody,
        html: htmlBody,
        reply_to: [inboundEmail, supportAlertEmail()].filter(Boolean),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      console.log('[TicketEmailer] Customer confirmation email sent:', data.id);
      return { success: true, messageId: data.id };
    } else {
      const errText = await res.text();
      console.warn('[TicketEmailer] Resend API error sending customer email:', errText);
      return { success: false, error: errText };
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn('[TicketEmailer] Network error sending customer email:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * 2. Alert to the support inbox (SUPPORT_ALERT_EMAIL, default support@appointmentlyy.com). "Blocking my work" reports
 * say URGENT in the subject. The body has the ticket id, workspace, who, urgency, area, what happened and a link to
 * Platform › Support; never screenshots, never the captured context beyond the page, never secrets.
 */
export async function sendAdminTicketAlert(
  ticket: TroubleTicket,
  opts: { reply?: TicketMessage; screenshots?: number } = {},
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    console.warn('[TicketEmailer] No Resend API key configured. Skipping support alert email.');
    return { success: false, error: 'Resend API key not configured' };
  }

  const fromEmail = 'Appointmentlyy Support <emil@appointmentlyy.com>';
  const to = supportAlertEmail();
  const inboundEmail = getResendInboundEmail();
  const priorityInfo = getPriorityColor(ticket.priority);
  const urgent = ticket.urgency === 'blocking' || (!ticket.urgency && ticket.priority === 'urgent');
  const urgency = urgencyLabel(ticket.urgency) || priorityInfo.label;
  const area = areaLabel(ticket.area) || ticket.category;
  const link = `${getAppBaseUrl()}/platform/support?id=${encodeURIComponent(ticket.id)}`;
  const page = ticket.context?.page?.path || '';
  const shots = opts.screenshots ?? ticket.attachmentCount ?? 0;
  const role = ticket.requesterRole ? `, ${ticket.requesterRole}` : '';
  const what = opts.reply ? opts.reply.content : ticket.description;

  const subject = oneLine(
    `${urgent ? 'URGENT: ' : ''}${opts.reply ? 'New reply on ' : ''}[${ticket.id}] ${ticket.tenantName}: ${ticket.subject}`,
    200,
  );

  const textBody = [
    opts.reply ? `New reply on support ticket ${ticket.id}` : `New support ticket ${ticket.id}`,
    '',
    `Ticket: ${ticket.id}`,
    `Workspace: ${ticket.tenantName} (${ticket.tenantCode})`,
    `From: ${ticket.requesterName} <${ticket.requesterEmail}>${role}`,
    `Urgency: ${urgency}`,
    `Area: ${area}`,
    page ? `Page: ${page}` : '',
    `Screenshots: ${shots}`,
    '',
    opts.reply ? `${opts.reply.senderName} wrote:` : 'What happened:',
    what,
    !opts.reply && ticket.tried ? `\nWhat they were trying to do:\n${ticket.tried}` : '',
    '',
    `Open it in Platform > Support: ${link}`,
  ]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n')
    .trim();

  const row = (label: string, value: string) =>
    `<tr><td style="padding: 6px 0; width: 120px; vertical-align: top; font-size: 12px; color: #a1a1aa;">${escapeHtml(label)}</td><td style="padding: 6px 0; font-size: 13px; color: #f4f4f5;">${escapeHtml(value)}</td></tr>`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Support ticket ${escapeHtml(ticket.id)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #09090b; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #18181b; border-radius: 12px; overflow: hidden; border: 1px solid #27272a;">
          <tr>
            <td style="background-color: #27272a; padding: 20px 28px; border-bottom: 2px solid ${urgent ? '#dc2626' : '#3f3f46'};">
              <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; letter-spacing: 1px; color: ${urgent ? '#f87171' : '#a1a1aa'};">
                ${urgent ? 'URGENT: blocking their work' : opts.reply ? 'New reply' : 'New support ticket'}
              </div>
              <div style="font-size: 16px; font-weight: 700; color: #ffffff; margin-top: 4px;">${escapeHtml(ticket.subject)}</div>
              <div style="font-family: monospace; font-size: 12px; color: #d4d4d8; margin-top: 6px;">${escapeHtml(ticket.id)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">
                ${row('Workspace', `${ticket.tenantName} (${ticket.tenantCode})`)}
                ${row('From', `${ticket.requesterName} <${ticket.requesterEmail}>${role}`)}
                ${row('Urgency', urgency)}
                ${row('Area', area)}
                ${page ? row('Page', page) : ''}
                ${row('Screenshots', String(shots))}
              </table>
              <div style="background-color: #09090b; border: 1px solid #27272a; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                <div style="font-size: 11px; text-transform: uppercase; color: #71717a; font-weight: 700; margin-bottom: 8px;">${opts.reply ? `${escapeHtml(opts.reply.senderName)} wrote` : 'What happened'}</div>
                <div style="font-size: 13px; line-height: 1.6; color: #d4d4d8; white-space: pre-wrap;">${escapeHtml(what)}</div>
              </div>
              ${!opts.reply && ticket.tried ? `<div style="background-color: #09090b; border: 1px solid #27272a; border-radius: 8px; padding: 16px; margin-bottom: 16px;"><div style="font-size: 11px; text-transform: uppercase; color: #71717a; font-weight: 700; margin-bottom: 8px;">What they were trying to do</div><div style="font-size: 13px; line-height: 1.6; color: #d4d4d8; white-space: pre-wrap;">${escapeHtml(ticket.tried)}</div></div>` : ''}
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(link)}" style="display: inline-block; background-color: #ED1C24; color: #ffffff; text-decoration: none; padding: 12px 28px; font-size: 13px; font-weight: 700; border-radius: 8px;">Open in Platform &rsaquo; Support</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        text: textBody,
        html: htmlBody,
        reply_to: [ticket.requesterEmail, inboundEmail].filter(Boolean),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, messageId: data.id };
    }
    const errText = await res.text();
    console.warn('[TicketEmailer] Resend API error sending support alert:', errText.slice(0, 300));
    return { success: false, error: errText };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn('[TicketEmailer] Network error sending support alert:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * 2b. Screenshot storage alert to the support inbox: a workspace has passed 80% of its 30-day screenshot allowance.
 * Sent once per workspace per 30 days (deduplicated by the caller with a durable note, see supportShotQuota.ts).
 * Numbers and names only: no screenshots, no ticket text.
 */
export async function sendScreenshotQuotaAlert(a: {
  tenantCode: string;
  tenantName: string;
  ticketId: string;
  percent: number;
  bytes: number;
  capBytes: number;
  shots: number;
  capShots: number;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    console.warn('[TicketEmailer] No Resend API key configured. Skipping screenshot storage alert.');
    return { success: false, error: 'Resend API key not configured' };
  }
  const mb = (b: number) => `${Math.round((b / (1024 * 1024)) * 10) / 10} MB`;
  const link = `${getAppBaseUrl()}/platform/support?id=${encodeURIComponent(a.ticketId)}`;
  const subject = oneLine(`Screenshot storage at ${a.percent}%: ${a.tenantName} (${a.tenantCode})`, 200);
  const lines = [
    `Workspace ${a.tenantName} (${a.tenantCode}) has passed 80% of its screenshot allowance for "Report a problem".`,
    '',
    `Last 30 days: ${mb(a.bytes)} of ${mb(a.capBytes)}, ${a.shots} of ${a.capShots} screenshots (${a.percent}%).`,
    'At 100% new screenshots are refused (reports are still saved). Screenshots are deleted after 90 days.',
    'This alert is sent once per workspace per 30 days.',
    '',
    `Latest report: ${a.ticketId}: ${link}`,
  ];
  const textBody = lines.join('\n');
  const htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:24px;background-color:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f4f4f5;"><div style="max-width:600px;margin:0 auto;background-color:#18181b;border:1px solid #27272a;border-radius:12px;padding:24px 28px;font-size:13px;line-height:1.6;">${lines
    .map((l) => (l ? `<p style="margin:0 0 8px;">${escapeHtml(l)}</p>` : ''))
    .join('')}</div></body></html>`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Appointmentlyy Support <emil@appointmentlyy.com>', to: [supportAlertEmail()], subject, text: textBody, html: htmlBody }),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, messageId: data.id };
    }
    const errText = await res.text();
    console.warn('[TicketEmailer] Resend API error sending screenshot storage alert:', errText.slice(0, 300));
    return { success: false, error: errText };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn('[TicketEmailer] Network error sending screenshot storage alert:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * 3. Send Notification to Customer when Admin / Emil replies in the Dashboard
 */
export async function sendCustomerReplyNotification(ticket: TroubleTicket, message: TicketMessage): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    return { success: false, error: 'Resend API key not configured' };
  }

  const fromEmail = getResendFromEmail();
  const inboundEmail = getResendInboundEmail();

  const subject = oneLine(`Re: [${ticket.id}] ${ticket.subject} - Support Update`, 200);

  const textBody = `
Hi ${ticket.requesterName},

Emil Halili (Appointmentlyy SDR Engineering) has updated your trouble ticket ${ticket.id}:

"${message.content}"

View full conversation or reply live in your dashboard:
${myReportsLink(ticket.id)}

Best regards,
Emil Halili & The Appointmentlyy Engineering Team
`.trim();

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ticket Update</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #18181b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e4e4e7;">
          <tr>
            <td style="background-color: #18181b; padding: 20px 28px; border-bottom: 3px solid #ED1C24;">
              <span style="display: inline-block; background-color: #ED1C24; color: #ffffff; font-weight: 800; font-size: 13px; padding: 4px 8px; border-radius: 6px;">APPOINTMENTLYY</span>
              <span style="color: #a1a1aa; font-size: 13px; font-weight: 600; margin-left: 8px;">TICKET UPDATE</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px;">
              <div style="font-size: 14px; color: #52525b; margin-bottom: 16px;">
                Hi <strong>${escapeHtml(ticket.requesterName)}</strong>, Emil Halili from Appointmentlyy Support just responded to your ticket <strong>#${escapeHtml(ticket.id)}</strong>:
              </div>

              <div style="background-color: #f8fafc; border-left: 4px solid #ED1C24; padding: 16px; border-radius: 0 8px 8px 0; font-size: 14px; line-height: 1.6; color: #0f172a; margin-bottom: 24px;">
                ${escapeHtml(message.content).replace(/\n/g, '<br/>')}
              </div>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(myReportsLink(ticket.id))}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 10px 24px; font-size: 13px; font-weight: 600; border-radius: 6px;">
                      Reply in Ticket Dashboard &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [ticket.requesterEmail],
        subject: subject,
        text: textBody,
        html: htmlBody,
        reply_to: [inboundEmail, supportAlertEmail()].filter(Boolean),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, messageId: data.id };
    }
    return { success: false, error: await res.text() };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMsg };
  }
}

/**
 * 4. Send Ultra-Minimalist Appointmentlyy System Invoice Email to Client
 *    Supports:
 *    - Month 1 Onboarding ($2,500 Setup + Included Month 1 BYOK + Included 8,000 ICP Credits)
 *    - Month 2+ Renewal ($249 BYOK + Chosen ICP Volume Pack)
 *    - On-Demand ICP Quota Tap-Up ($50/2k, $75/5k, $150/10k)
 */
export async function sendAppointmentlyySystemInvoiceEmail(params: {
  invoiceNumber: string;
  tenantName: string;
  clientContactName: string;
  clientEmail: string;
  issueDate: string;
  dueDate: string;
  totalAmountUsd: number;
  lineItems: { description: string; subtext?: string; amountUsd: number }[];
  ticketId?: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    console.warn('[TicketEmailer] No Resend API key configured. Invoice email simulated.');
    return { success: false, error: 'Resend API key not configured (Invoice logged in system)' };
  }

  const fromEmail = getResendFromEmail();
  const inboundEmail = getResendInboundEmail();
  const wiseUrl = 'https://wise.com/pay/me/emilhalilih';

  const subject = `Invoice ${params.invoiceNumber} from Appointmentlyy ($${params.totalAmountUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD)`;

  const rowsText = params.lineItems
    .map(
      (item) =>
        `- ${item.description}${item.subtext ? ` (${item.subtext})` : ''}: $${item.amountUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
    )
    .join('\n');

  const textBody = `
Appointmentlyy — Official Invoice ${params.invoiceNumber}
Issued: ${params.issueDate}

Billed To:
${params.tenantName}
${params.clientContactName} (${params.clientEmail})

Amount Due: $${params.totalAmountUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD

Line Items:
${rowsText}

Total Due: $${params.totalAmountUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD

Pay via Wise:
${wiseUrl}
Wise Tag: @emilhalilih
Please reference ${params.invoiceNumber} in your transfer note.

Refund & Cancellation Policy:
- Setup & Infrastructure: Initial workspace deployment, configuration, and setup fees ($2,500) are non-refundable once resource provisioning has begun.
- Monthly Subscriptions: Recurring monthly charges ($249/mo BYOK) operate on a flexible 30-day model with zero multi-year lock-in and are non-refundable once a billing cycle commences; cancel anytime prior to the next billing date.
- Data Credits & Consumables: Contact enrichment batches and ICP Data Cloud record allocations are non-refundable once provisioned or processed.
Inquiries: Admin@appointmentlyy.com
`.trim();

  const rowsHtml = params.lineItems
    .map(
      (item) => `
      <tr>
        <td style="padding: 14px 16px 14px 0; border-bottom: 1px solid #f4f4f5; vertical-align: top;">
          <div style="font-size: 13px; font-weight: 500; color: #18181b;">${escapeHtml(item.description)}</div>
          ${
            item.subtext
              ? `<div style="font-size: 12px; color: #a1a1aa; margin-top: 2px;">${escapeHtml(item.subtext)}</div>`
              : ''
          }
        </td>
        <td style="padding: 14px 0; border-bottom: 1px solid #f4f4f5; text-align: right; font-family: monospace; font-size: 13px; color: ${
          item.amountUsd === 0 ? '#a1a1aa' : '#18181b'
        }; vertical-align: top;">
          $${item.amountUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
      </tr>`
    )
    .join('');

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice ${escapeHtml(params.invoiceNumber)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #fafafa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #18181b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fafafa; padding: 36px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e4e4e7;">
          
          <!-- Solid Black Minimalist Header -->
          <tr>
            <td style="background-color: #09090b; padding: 24px 36px; color: #ffffff;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td valign="middle">
                    <div style="display: inline-block; background-color: #ED1C24; color: #09090b; font-weight: 900; font-size: 15px; padding: 4px 12px; border-radius: 6px; letter-spacing: -0.3px;">Appointmently</div>
                    <div style="font-size: 12px; color: #a1a1aa; margin-top: 6px;">emil@appointmentlyy.com</div>
                  </td>
                  <td align="right" valign="middle">
                    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #a1a1aa;">Invoice</div>
                    <div style="font-family: monospace; font-size: 13px; font-weight: 600; color: #ffffff; margin-top: 4px;">${escapeHtml(params.invoiceNumber)}</div>
                    <div style="font-size: 12px; color: #a1a1aa; margin-top: 2px;">${escapeHtml(params.issueDate)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Minimalist Body -->
          <tr>
            <td style="padding: 36px;">
              
              <!-- Billed To & Amount Due -->
              <table width="100%" cellpadding="0" cellspacing="0" style="padding-bottom: 24px; border-bottom: 1px solid #f4f4f5;">
                <tr>
                  <td valign="bottom">
                    <div style="font-size: 12px; color: #a1a1aa; margin-bottom: 4px;">Billed to</div>
                    <div style="font-size: 13px; font-weight: 600; color: #18181b;">${escapeHtml(params.tenantName)}</div>
                    <div style="font-size: 12px; color: #71717a; margin-top: 2px;">${escapeHtml(params.clientContactName)} &bull; ${escapeHtml(params.clientEmail)}</div>
                  </td>
                  <td align="right" valign="bottom">
                    <div style="font-size: 12px; color: #a1a1aa; margin-bottom: 2px;">Amount due</div>
                    <div style="font-family: monospace; font-size: 24px; font-weight: 600; color: #09090b;">
                      $${params.totalAmountUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style="font-size: 12px; font-weight: 400; color: #a1a1aa;">USD</span>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Line Items Table -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 16px;">
                <thead>
                  <tr>
                    <th align="left" style="padding: 10px 0; border-bottom: 1px solid #f4f4f5; font-size: 12px; font-weight: 400; color: #a1a1aa;">Description</th>
                    <th align="right" style="padding: 10px 0; border-bottom: 1px solid #f4f4f5; font-size: 12px; font-weight: 400; color: #a1a1aa; width: 110px;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>

              <!-- Total Due Row -->
              <table width="100%" cellpadding="0" cellspacing="0" style="padding-top: 16px; padding-bottom: 28px; border-top: 1px solid #e4e4e7;">
                <tr>
                  <td style="font-size: 12px; font-weight: 500; color: #71717a;">Total due</td>
                  <td align="right" style="font-family: monospace; font-size: 14px; font-weight: 600; color: #09090b;">
                    $${params.totalAmountUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                  </td>
                </tr>
              </table>

              <!-- Pay via Wise Block -->
              <table width="100%" cellpadding="0" cellspacing="0" style="padding-top: 24px; border-top: 1px solid #f4f4f5;">
                <tr>
                  <td>
                    <div style="font-size: 12px; font-weight: 600; color: #18181b; margin-bottom: 6px;">Pay via Wise</div>
                    <div style="font-size: 12px; color: #71717a; line-height: 1.6; margin-bottom: 14px;">
                      Transfer via Wise using the link below (Tag: <strong style="font-family: monospace; color: #18181b;">@emilhalilih</strong>). Please reference <strong style="font-family: monospace; color: #18181b;">${escapeHtml(params.invoiceNumber)}</strong> in your payment note.
                    </div>
                    <a href="${wiseUrl}" style="display: inline-block; background-color: #09090b; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-size: 12px; font-weight: 500;">
                      wise.com/pay/me/emilhalilih &nearr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Refund & Cancellation Policy -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #f4f4f5;">
                <tr>
                  <td style="font-size: 11px; color: #a1a1aa; line-height: 1.6;">
                    <div style="font-weight: 600; color: #52525b; margin-bottom: 4px;">Refund &amp; Cancellation Policy</div>
                    <strong>Setup &amp; Infrastructure:</strong> Initial workspace deployment, configuration, and setup fees ($2,500) are non-refundable once resource provisioning has begun.
                    <strong>Monthly Subscriptions:</strong> Recurring monthly charges ($249/mo BYOK) operate on a flexible 30-day model with zero multi-year lock-in and are non-refundable once a billing cycle commences; cancel anytime prior to the next billing date.
                    <strong>Data Credits &amp; Consumables:</strong> Contact enrichment batches and ICP Data Cloud record allocations are non-refundable once provisioned or processed.
                    Inquiries: <span style="font-family: monospace; color: #52525b;">Admin@appointmentlyy.com</span>
                  </td>
                </tr>
              </table>

            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  try {
    const recipients = [params.clientEmail.trim()];
    if (!recipients.includes('emil@appointmentlyy.com')) {
      recipients.push('emil@appointmentlyy.com');
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: recipients,
        subject,
        text: textBody,
        html: htmlBody,
        reply_to: [inboundEmail, 'emil@appointmentlyy.com'],
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, messageId: data.id };
    }
    return { success: false, error: await res.text() };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMsg };
  }
}
