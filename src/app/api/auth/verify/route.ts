import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/authToken';
import { getTenantStore } from '@/lib/server/tenantStore';
import { PLATFORM_TENANT_CODE } from '@/lib/roles';
import { isPlatformAdmin, recordLogin, resolveIdentity } from '@/lib/server/tenancy';
import { publicIdentity, setSessionCookie } from '@/lib/server/session';

const fail = (error: string, status = 401) => NextResponse.json({ success: false, error }, { status });

/**
 * POST /api/auth/verify  { token }
 * Exchanges an emailed sign-in or invite link for the httpOnly session cookie. The member record
 * is re-checked: removed people, replaced invites and suspended workspaces are refused.
 */
export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json().catch(() => ({ token: '' }));
    const payload = verifyAuthToken(token, ['login', 'invite']);
    if (!payload) return fail('This link is invalid or has expired. Request a new one.');

    if (payload.typ === 'invite') {
      const member = (await getTenantStore().listMembers({ tenantCode: payload.tenantCode, email: payload.email }))[0];
      if (!member || member.status === 'removed') return fail('This invite has been withdrawn. Ask your admin for a new one.');
      if (member.inviteNonce !== payload.nonce) {
        return fail(
          member.status === 'invited'
            ? 'A newer invite was sent to you. Use the link in the latest email.'
            : 'This invite was already used. Sign in with your email instead.',
        );
      }
      // An accepted invite stays usable briefly (double-clicks, a second tab), then sign-in links take over.
      if (member.status === 'active' && (!member.joinedAt || Date.now() - Date.parse(member.joinedAt) > 10 * 60_000)) {
        return fail('This invite was already used. Sign in with your email instead.');
      }
      // Staff status never comes from a client workspace's invite (it was minted at a client's
      // request): staff sign in with their own sign-in link or password.
      if (payload.tenantCode !== PLATFORM_TENANT_CODE && (await isPlatformAdmin(payload.email))) {
        return fail('This invite can’t be used. Sign in with your email instead.', 403);
      }
    }

    const identity = await resolveIdentity(payload.email, payload.tenantCode, payload.repName);
    if (!identity) return fail('You no longer have access to this workspace. Ask your admin.', 403);

    await recordLogin(identity, payload.typ);
    // First sign-in without a password: the page asks them to create one.
    const hasPassword = Boolean(await getTenantStore().getCredential(payload.email));
    const res = NextResponse.json({ success: true, identity: publicIdentity(identity), hasPassword });
    await setSessionCookie(res, identity);
    return res;
  } catch (err) {
    console.error('[Auth verify]', err);
    return fail('Could not verify this link.', 500);
  }
}
