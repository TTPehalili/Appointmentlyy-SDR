import { NextRequest, NextResponse, after } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { EMAIL_RE } from '@/lib/roles';
import { getTenantStore } from '@/lib/server/tenantStore';
import { pickLoginWorkspace, resolveIdentity } from '@/lib/server/tenancy';
import { sendPasswordReset } from '@/lib/server/passwords';
import { isDemoLogin } from '@/lib/server/authLinks';

const GENERIC = 'If this email has an Appointmentlyy account, a password reset link is on its way. It expires in 30 minutes.';

/**
 * POST /api/auth/password/forgot  { email }
 * Emails a 30-minute, single-use link to choose a new password (also works for people who never
 * set one). Same reply whether or not the account exists.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return NextResponse.json({ success: false, error: 'Enter your work email.' }, { status: 400 });

    const ip = (req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
    if (!rateLimit(`reset-ip:${ip}`, 20, 10 * 60_000) || !rateLimit(`reset-email:${email}`, 3, 15 * 60_000)) {
      return NextResponse.json({ success: false, error: 'Too many requests. Please wait a few minutes.' }, { status: 429 });
    }

    const tenantCode = await pickLoginWorkspace(email);
    const identity = tenantCode ? await resolveIdentity(email, tenantCode) : null;
    if (!identity) return NextResponse.json({ success: true, message: GENERIC });

    const store = getTenantStore();
    const work = async () => {
      const sent = await sendPasswordReset({
        email,
        name: identity.name,
        cred: await store.getCredential(email),
        tenantCode: identity.tenant.code,
        tenantName: identity.tenant.branding.displayName || identity.tenant.name,
        requestOrigin: req.nextUrl.origin,
      });
      if (!sent.delivered) console.warn('[password/forgot] email not delivered:', sent.error);
      await store.addAudit({ actorEmail: email, tenantCode: identity.tenant.code, action: 'password.reset_requested', target: email, detail: {} });
      if (sent.delivered) console.info('[password/forgot] reset email sent');
      return sent;
    };
    if (isDemoLogin()) return NextResponse.json({ success: true, message: GENERIC, resetUrl: (await work()).resetUrl });
    // Send after replying (Next.js `after`), so a slower reply can't reveal that the account exists.
    after(async () => {
      try {
        await work();
      } catch (err) {
        console.warn('[password/forgot] failed:', err);
      }
    });
    return NextResponse.json({ success: true, message: GENERIC });
  } catch (err) {
    console.error('[password/forgot]', err);
    return NextResponse.json({ success: false, error: 'Password reset is temporarily unavailable.' }, { status: 500 });
  }
}
