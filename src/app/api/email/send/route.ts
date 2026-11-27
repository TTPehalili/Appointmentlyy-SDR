import { NextRequest, NextResponse } from 'next/server';
import { recordDelegatedSend, requireSendingSession, senderFor } from '@/lib/server/sendingPolicy';
import { formatEmailToParagraphs } from '@/lib/coldEmailStudio';
import { getResendApiKey } from '@/lib/resendConfig';
import { getConversationThreadKey, extractCleanEmailAddress } from '@/lib/emailStore';
import { getServerSession } from '@/lib/server/session';
import { onePagerFileName } from '@/lib/onePagerRender';
import { isMeetingPlanId } from '@/lib/server/meetingPlanStore';
import { brandFor, loadVisiblePlan, renderPlanPdf } from '@/lib/server/meetingPlanApi';
import { refuseSuppressedEmail } from '@/lib/server/suppressionApi';
import { RESEND_UNREACHABLE_MESSAGE, describeResendFailure, readResendFailure, resendRefusedMessage } from '@/lib/server/resendFailure';

type ResendAttachment = { filename: string; content: string };

/**
 * Optional `meetingPlanId`: attach that Meeting Action Plan's one-pager as a PDF. The plan is loaded
 * from the signed-in person's own workspace and must be one they can see. Returns the attachment, or
 * the error response to send (nothing is sent without the attachment that was asked for).
 */
async function meetingPlanAttachment(req: NextRequest, meetingPlanId: unknown): Promise<ResendAttachment | NextResponse> {
  const session = await getServerSession(req);
  if (!session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  const notFound = () => NextResponse.json({ error: 'Meeting plan not found.' }, { status: 404 });
  if (typeof meetingPlanId !== 'string' || !isMeetingPlanId(meetingPlanId)) return notFound();
  const plan = await loadVisiblePlan(session, meetingPlanId);
  if (!plan) return notFound();
  if (!plan.onePager) return NextResponse.json({ error: 'There is no one-pager for this meeting plan yet.' }, { status: 409 });
  try {
    const pdf = await renderPlanPdf(plan, await brandFor(session));
    return { filename: onePagerFileName(plan.lead.company), content: pdf.toString('base64') };
  } catch (err) {
    console.error('[EMAIL SEND] meeting plan PDF', err);
    return NextResponse.json({ error: 'Could not attach the meeting recap PDF. Nothing was sent.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // A recipient on the workspace's Do Not Contact list is never emailed (checked first, in every workspace).
  const suppressed = await refuseSuppressedEmail(req, 'email/send');
  if (suppressed) return suppressed;
  // Safety switch: client workspaces can't send until their own mailbox is connected.
  const gate = await requireSendingSession(req);
  if ('blocked' in gate) return gate.blocked;
  try {
    const payload = await req.json();
    // From, Reply-To and the sending key are decided on the server: any `from`,
    // `customSendingDomain` or `customResendApiKey` in the body is ignored.
    const {
      to,
      subject,
      body,
      leadName = 'Prospect',
      leadCompany = 'Target Company',
      leadTitle = 'Decision Maker',
      threadId,
      meetingPlanId
    } = payload;

    if (!to || !subject || !body) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject, body' },
        { status: 400 }
      );
    }

    let attachments: ResendAttachment[] | undefined;
    if (meetingPlanId !== undefined && meetingPlanId !== null && meetingPlanId !== '') {
      const att = await meetingPlanAttachment(req, meetingPlanId);
      if (att instanceof NextResponse) return att;
      attachments = [att];
    }

    // Escape HTML special characters to prevent malformed tags
    const escapeHtml = (str: string) =>
      str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Format HTML paragraphs so email clients (Gmail, Outlook) do not collapse line breaks
    const paragraphs = formatEmailToParagraphs(body);
    const formattedText = paragraphs.join('\n\n');

    const formattedHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111827;">
        ${paragraphs.map((p: string) => `<p style="margin: 0 0 16px 0; padding: 0; line-height: 1.6;">${escapeHtml(p).replace(/\n/g, '<br />')}</p>`).join('')}
      </div>
    `.trim();

    // The sender comes from the signed-in person and the workspace's configured sender only.
    // An owner's email delegate sends as the owner (decided on the server, see emailDelegation.ts).
    const { sender, onBehalf } = await senderFor(gate.session);
    const sanitizedFrom = sender.from;

    // The workspace's (platform) sending key. Per-workspace keys will come from Admin › Integrations.
    const activeResendKey = getResendApiKey();
    if (!activeResendKey) {
      return NextResponse.json(
        { error: 'RESEND_API_KEY is not configured or could not be loaded. Live dispatch cannot proceed.' },
        { status: 500 }
      );
    }

    let liveSendResult: any = null;

    // A delegate's send is recorded under their own name first (no content). No record, no send.
    await recordDelegatedSend(onBehalf, { via: 'email/send', to });

    try {
      const resendPayload: any = {
        from: sanitizedFrom,
        to: Array.isArray(to) ? to : [to],
        subject: subject,
        text: formattedText,
        html: formattedHtml,
        reply_to: sender.replyTo,
        ...(attachments ? { attachments } : {})
      };

      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeResendKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(resendPayload)
      });

      if (resendRes.ok) {
        liveSendResult = await resendRes.json();
      } else {
        // Status and error name only, in the log and the answer: the provider's text can quote the recipient.
        const failure = await readResendFailure(resendRes);
        console.error(`[RESEND DISPATCH ERROR] ${describeResendFailure(failure)}`);
        return NextResponse.json(
          { error: resendRefusedMessage(failure), code: 'PROVIDER_REJECTED' },
          { status: resendRes.status || 400 }
        );
      }
    } catch (err: any) {
      console.error('[RESEND API ERROR]', err?.name || 'Error');
      return NextResponse.json(
        { error: RESEND_UNREACHABLE_MESSAGE, code: 'PROVIDER_UNREACHABLE' },
        { status: 500 }
      );
    }

    const messageId = liveSendResult?.id;
    const cleanTo = extractCleanEmailAddress(Array.isArray(to) ? to[0] : to);

    let finalLeadName = leadName;
    let finalLeadCompany = leadCompany;
    let finalLeadTitle = leadTitle;

    if (cleanTo.includes('callview.ai')) {
      if (finalLeadName === 'Julian Vance' || finalLeadName === 'Prospect') {
        finalLeadName = 'Emil Halili';
      }
      if (finalLeadCompany === 'Apex Global BPO' || finalLeadCompany === 'Target Company') {
        finalLeadCompany = 'Callview AI';
      }
      if (finalLeadTitle === 'Decision Maker' || finalLeadTitle === 'Director of Outbound Operations') {
        finalLeadTitle = 'Founder / Decision Maker';
      }
    }

    const finalThreadId = threadId || getConversationThreadKey({
      direction: 'outbound',
      to: cleanTo,
      from: sanitizedFrom,
      subject: subject,
      threadId: threadId
    });

    const provider: 'resend_live' = 'resend_live';
    const emailRecord = {
      id: messageId,
      threadId: finalThreadId,
      direction: 'outbound' as const,
      from: sanitizedFrom,
      to: cleanTo,
      subject: subject,
      body: formattedText,
      timestamp: new Date().toISOString(),
      status: 'delivered' as const,
      leadName: finalLeadName,
      leadCompany: finalLeadCompany,
      leadTitle: finalLeadTitle,
      provider: provider,
      read: true
    };

    return NextResponse.json({
      success: true,
      messageId: messageId,
      provider: provider,
      email: emailRecord
    });
  } catch (error: any) {
    console.error('[EMAIL SEND ERROR]', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send email' },
      { status: 500 }
    );
  }
}
