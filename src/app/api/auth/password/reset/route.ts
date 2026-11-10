import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/authToken';
import { getTenantStore } from '@/lib/server/tenantStore';
import { pickLoginWorkspace, recordLogin, resolveIdentity } from '@/lib/server/tenancy';
import { credentialFingerprint, hashPassword, passwordProblem } from '@/lib/server/passwords';
import { publicIdentity, setSessionCookie } from '@/lib/server/session';

/**
 * POST /api/auth/password/reset  { token, password }
 * Sets a new password from an emailed reset link and signs the person in. The link stops working
 * once the password has changed.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const payload = verifyAuthToken(String(body?.token || ''), ['reset']);
    if (!payload) {
      return NextResponse.json({ success: false, error: 'This reset link is invalid or has expired. Request a new one.' }, { status: 401 });
    }
    const store = getTenantStore();
    const cred = await store.getCredential(payload.email);
    if (credentialFingerprint(cred) !== payload.nonce) {
      return NextResponse.json({ success: false, error: 'This reset link was already used. Request a new one if you still need it.' }, { status: 401 });
    }

    const password = String(body?.password || '');
    const problem = passwordProblem(password, payload.email);
    if (problem) return NextResponse.json({ success: false, error: problem }, { status: 400 });

    // Still a member somewhere? (Removed people can't use an old reset link to get back in.)
    const tenantCode = (await resolveIdentity(payload.email, payload.tenantCode)) ? payload.tenantCode : await pickLoginWorkspace(payload.email);
    const identity = tenantCode ? await resolveIdentity(payload.email, tenantCode, payload.repName) : null;
    if (!identity) return NextResponse.json({ success: false, error: 'You no longer have access to Appointmentlyy. Ask your admin.' }, { status: 403 });

    await store.setCredential(payload.email, await hashPassword(password));
    await store.addAudit({ actorEmail: payload.email, tenantCode: identity.tenant.code, action: 'password.reset', target: payload.email, detail: {} });
    await recordLogin(identity, 'password_reset');

    const res = NextResponse.json({ success: true, identity: publicIdentity(identity) });
    await setSessionCookie(res, identity);
    return res;
  } catch (err) {
    console.error('[password/reset]', err);
    return NextResponse.json({ success: false, error: 'Could not reset the password.' }, { status: 500 });
  }
}
