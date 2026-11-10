import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { EMAIL_RE } from '@/lib/roles';
import { getTenantStore } from '@/lib/server/tenantStore';
import { pickLoginWorkspace, recordLogin, resolveIdentity } from '@/lib/server/tenancy';
import { verifyPassword } from '@/lib/server/passwords';
import { publicIdentity, setSessionCookie } from '@/lib/server/session';

const WRONG = 'Email or password is incorrect.';

/**
 * POST /api/auth/password/login  { email, password }
 * Password sign-in for people who have set a password. Workspace and role come from their
 * membership. One generic error for every failure, so it can't be used to find accounts.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    if (!EMAIL_RE.test(email) || !password) {
      return NextResponse.json({ success: false, error: 'Enter your email and password.' }, { status: 400 });
    }

    const ip = (req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
    if (!rateLimit(`pw-ip:${ip}`, 30, 10 * 60_000) || !rateLimit(`pw-email:${email}`, 8, 15 * 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Too many attempts. Wait 15 minutes, or use “Forgot password?” to reset it.' },
        { status: 429 },
      );
    }

    const store = getTenantStore();
    const cred = await store.getCredential(email);
    const ok = await verifyPassword(password, cred?.passwordHash);
    const tenantCode = ok ? await pickLoginWorkspace(email) : null;
    const identity = tenantCode ? await resolveIdentity(email, tenantCode) : null;
    if (!ok || !identity) return NextResponse.json({ success: false, error: WRONG }, { status: 401 });

    await recordLogin(identity, 'password');
    const res = NextResponse.json({ success: true, identity: publicIdentity(identity) });
    await setSessionCookie(res, identity);
    return res;
  } catch (err) {
    console.error('[password/login]', err);
    return NextResponse.json({ success: false, error: 'Sign-in is temporarily unavailable.' }, { status: 500 });
  }
}
