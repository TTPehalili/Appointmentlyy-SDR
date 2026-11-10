import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { getTenantStore } from '@/lib/server/tenantStore';
import { getServerSession, setSessionCookie } from '@/lib/server/session';
import { hashPassword, passwordProblem, verifyPassword } from '@/lib/server/passwords';

/** GET /api/auth/password/change → { hasPassword } for the signed-in person. */
export async function GET(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
  const cred = await getTenantStore().getCredential(session.email);
  return NextResponse.json({ success: true, hasPassword: Boolean(cred), updatedAt: cred?.updatedAt ?? null });
}

/**
 * POST /api/auth/password/change  { currentPassword?, newPassword }
 * Set a first password, or change it (the current password is required once one exists).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
  if (!rateLimit(`pw-change:${session.email}`, 10, 15 * 60_000)) {
    return NextResponse.json({ success: false, error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const store = getTenantStore();
    const cred = await store.getCredential(session.email);
    if (cred && !(await verifyPassword(String(body?.currentPassword || ''), cred.passwordHash))) {
      return NextResponse.json({ success: false, error: 'Your current password is incorrect.' }, { status: 400 });
    }
    const next = String(body?.newPassword || '');
    const problem = passwordProblem(next, session.email);
    if (problem) return NextResponse.json({ success: false, error: problem }, { status: 400 });

    await store.setCredential(session.email, await hashPassword(next));
    await store.addAudit({ actorEmail: session.email, tenantCode: session.tenantCode, action: cred ? 'password.change' : 'password.set', target: session.email, detail: {} });
    // Other devices are signed out by the password change; keep this one signed in.
    const res = NextResponse.json({ success: true });
    await setSessionCookie(res, session.identity);
    return res;
  } catch (err) {
    console.error('[password/change]', err);
    return NextResponse.json({ success: false, error: 'Could not save the password.' }, { status: 500 });
  }
}
