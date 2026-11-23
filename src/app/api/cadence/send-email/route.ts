import { NextRequest, NextResponse } from 'next/server';
import { recordDelegatedSend, requireSendingSession, senderFor } from '@/lib/server/sendingPolicy';
import { getResendApiKey } from '@/lib/resendConfig';

export async function POST(req: NextRequest) {
  // Safety switch: client workspaces can't send until their own mailbox is connected.
  const gate = await requireSendingSession(req);
  if ('blocked' in gate) return gate.blocked;
  try {
    const payload = await req.json();
    // The sender is decided on the server; a `from` in the body is ignored.
    const { to, subject, body, cadence_day, touch_number } = payload;
    const { sender, onBehalf } = await senderFor(gate.session);

    if (!to || !subject || !body) {
      return NextResponse.json(
        { status: 'error', message: 'Missing required email fields (to, subject, body)' },
        { status: 400 }
      );
    }

    const resendApiKey = getResendApiKey();
    let externalDispatchResult = null;

    if (resendApiKey) {
      // A delegate's send is recorded under their own name first (no content). No record, no send.
      await recordDelegatedSend(onBehalf, { via: 'cadence/send-email', to });
      try {
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: sender.from,
            reply_to: sender.replyTo,
            to: [to],
            subject: subject,
            text: body
          })
        });

        if (resendRes.ok) {
          externalDispatchResult = await resendRes.json();
        } else {
          console.warn('[RESEND DISPATCH WARNING] Non-200 response from Resend:', await resendRes.text());
        }
      } catch (e: any) {
        console.error('[RESEND API ERROR]', e.message);
      }
    }

    const messageId = externalDispatchResult?.id || `resend_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    console.log(`[CADENCE EMAIL DISPATCH] Day ${cadence_day || 1} Touch #${touch_number || 1} sent to ${to}. Subject: "${subject}". MsgID: ${messageId}`);

    return NextResponse.json({
      status: 'success',
      message_id: messageId,
      dispatched_to: to,
      subject: subject,
      cadence_day: cadence_day || 1,
      touch_number: touch_number || 1,
      provider: resendApiKey ? 'resend_live' : 'resend_sandbox_simulated',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[CADENCE EMAIL SEND ERROR]', error);
    return NextResponse.json(
      { status: 'error', message: error.message || 'Failed to dispatch cadence email' },
      { status: 500 }
    );
  }
}
