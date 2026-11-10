/** Server-only: build and email sign-in and invite links. */
import { getAppBaseUrl, signAuthToken } from '@/lib/authToken';
import { sendAuthEmail } from '@/lib/authMailer';
import type { Member, Tenant } from '@/lib/server/tenantStore';
import type { Role } from '@/lib/roles';

const LOGO = () => `${(process.env.NEXT_PUBLIC_APP_URL || 'https://app.appointmentlyy.com').replace(/\/$/, '')}/appointmentlyy-logo.png`;

export const INVITE_TTL_SECONDS = 7 * 24 * 3600;
export const LOGIN_TTL_SECONDS = 15 * 60;

/** Demo builds (NEXT_PUBLIC_DEMO_LOGIN=1) may show links on screen; real ones only email them. */
export const isDemoLogin = () => process.env.NEXT_PUBLIC_DEMO_LOGIN === '1';

export async function sendInvite(opts: {
  member: Member;
  tenant: Tenant;
  nonce: string;
  inviterName: string;
  requestOrigin: string;
}): Promise<{ delivered: boolean; inviteUrl: string; error?: string }> {
  const { member, tenant, nonce, inviterName, requestOrigin } = opts;
  const name = member.name || member.email.split('@')[0];
  const token = signAuthToken(
    {
      typ: 'invite',
      email: member.email,
      role: member.role,
      tenantName: tenant.name,
      tenantCode: tenant.code,
      repName: name,
      invitedBy: inviterName,
      nonce,
    },
    INVITE_TTL_SECONDS,
  );
  const inviteUrl = `${getAppBaseUrl(requestOrigin)}/login/verify?token=${encodeURIComponent(token)}`;
  const sent = await sendAuthEmail(member.email, {
    kind: 'invite',
    recipientName: name.split(' ')[0] || 'there',
    workspaceName: tenant.branding.displayName || tenant.name,
    role: member.role,
    invitedBy: inviterName,
    loginUrl: inviteUrl,
    expiresText: '7 days',
    logoUrl: LOGO(),
  });
  return { delivered: sent.ok, inviteUrl, error: sent.ok ? undefined : sent.error };
}

export async function sendLoginLink(opts: {
  email: string;
  name: string;
  role: Role;
  tenant: Tenant;
  requestOrigin: string;
}): Promise<{ delivered: boolean; loginUrl: string; error?: string }> {
  const { email, name, role, tenant, requestOrigin } = opts;
  const token = signAuthToken(
    { typ: 'login', email, role, tenantName: tenant.name, tenantCode: tenant.code, repName: name },
    LOGIN_TTL_SECONDS,
  );
  const loginUrl = `${getAppBaseUrl(requestOrigin)}/login/verify?token=${encodeURIComponent(token)}`;
  const sent = await sendAuthEmail(email, {
    kind: 'login',
    recipientName: (name || email).split(/[ @]/)[0] || 'there',
    workspaceName: tenant.branding.displayName || tenant.name,
    role,
    loginUrl,
    expiresText: '15 minutes',
    logoUrl: LOGO(),
  });
  return { delivered: sent.ok, loginUrl, error: sent.ok ? undefined : sent.error };
}
