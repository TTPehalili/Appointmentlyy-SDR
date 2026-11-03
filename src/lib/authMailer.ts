/**
 * Server-only: dispatches login / invite emails through Resend.
 */
import { getResendApiKey, getResendFromEmail } from '@/lib/resendConfig';
import {
  LoginEmailParams,
  buildLoginEmailHtml,
  buildLoginEmailSubject,
  buildLoginEmailText,
} from '@/lib/loginEmail';

export async function sendAuthEmail(
  to: string,
  params: LoginEmailParams
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const apiKey = getResendApiKey();
  if (!apiKey) return { ok: false, error: 'Email provider is not configured.' };

  const fromRaw = getResendFromEmail();
  const addr = fromRaw.match(/<([^>]+)>/)?.[1] || fromRaw;
  const from = `Appointmentlyy SDR <${addr.trim()}>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: buildLoginEmailSubject(params),
        html: buildLoginEmailHtml(params),
        text: buildLoginEmailText(params),
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[Auth Mailer] Resend rejected email:', res.status, data?.message || data);
      return { ok: false, error: data?.message || `Email provider error (${res.status}).` };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.warn('[Auth Mailer] Send failed:', err);
    return { ok: false, error: 'Could not reach the email provider.' };
  }
}

