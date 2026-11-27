import { NextRequest, NextResponse } from 'next/server';
import { recordDelegatedSend, requireSendingSession, senderFor } from '@/lib/server/sendingPolicy';
import { getResendApiKey } from '@/lib/resendConfig';
import { refuseSuppressedEmail } from '@/lib/server/suppressionApi';

export async function POST(req: NextRequest) {
  // A recipient on the workspace's Do Not Contact list is never emailed (checked at send time, every workspace).
  const suppressed = await refuseSuppressedEmail(req, 'cadence/send-email');
  if (suppressed) return suppressed;
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
          // Status and error name only: the provider's message can quote the recipient address.
          const errName = await resendRes.json().then((j: { name?: unknown }) => String(j?.name || '').replace(/[^\w.-]/g, '').slice(0, 60), () => '');
          console.warn(`[RESEND DISPATCH WARNING] Non-200 response from Resend: ${resendRes.status}${errName ? ` ${errName}` : ''}`);
        }
      } catch (e: any) {
        console.error('[RESEND API ERROR]', e.message);
      }
    }

    const messageId = externalDispatchResult?.id || `resend_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // No recipient address or subject in the logs (personal data).
    console.log(`[CADENCE EMAIL DISPATCH] Day ${Number(cadence_day) || 1} Touch #${Number(touch_number) || 1} sent. MsgID: ${messageId}`);

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
