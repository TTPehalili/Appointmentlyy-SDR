import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { EMAIL_RE } from '@/lib/roles';
import { pickLoginWorkspace, resolveIdentity } from '@/lib/server/tenancy';
import { isDemoLogin, sendLoginLink } from '@/lib/server/authLinks';

const GENERIC = 'If this email has access to Appointmentlyy, a sign-in link is on its way. It expires in 15 minutes.';

/**
 * POST /api/auth/send-link  { email }
 * Emails a 15-minute sign-in link to someone who already belongs to a workspace.
 * Role and workspace come from the member record, never from the request. The reply is the
 * same whether or not the email has access, so the endpoint can't be used to find accounts.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return NextResponse.json({ success: false, error: 'Please enter a valid work email.' }, { status: 400 });
    }

    const ip = (req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
    if (!rateLimit(`ip:${ip}`, 30, 10 * 60_000) || !rateLimit(`email:${email}`, 5, 10 * 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please wait a few minutes and try again.' },
        { status: 429 },
      );
    }

    const tenantCode = await pickLoginWorkspace(email);
    const identity = tenantCode ? await resolveIdentity(email, tenantCode) : null;
    if (!identity) {
      return NextResponse.json({ success: true, message: GENERIC });
    }

    const sending = sendLoginLink({
      email,
      name: identity.name,
      role: identity.role,
      tenant: identity.tenant,
      requestOrigin: req.nextUrl.origin,
    });
    if (isDemoLogin()) {
      // Demo builds only: show the link on screen (lets local testing work without an inbox).
      const sent = await sending;
      return NextResponse.json({ success: true, message: GENERIC, loginUrl: sent.loginUrl, emailDelivered: sent.delivered });
    }
    // Don't wait for the email provider: a slower reply would reveal that the account exists.
    sending
      .then((sent) => !sent.delivered && console.warn('[Auth send-link] email not delivered:', sent.error))
      .catch((err) => console.warn('[Auth send-link] email failed:', err));
    return NextResponse.json({ success: true, message: GENERIC });
  } catch (err) {
    console.error('[Auth send-link]', err);
    return NextResponse.json({ success: false, error: 'Sign-in is temporarily unavailable.' }, { status: 500 });
  }
}
