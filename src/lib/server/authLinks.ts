/** Server-only: build and email sign-in and invite links. */
import { getAppBaseUrl, signAuthToken } from '@/lib/authToken';
import { sendAuthEmail } from '@/lib/authMailer';
import type { Member, Tenant } from '@/lib/server/tenantStore';
import type { Role } from '@/lib/roles';
import { DEMO_LOGIN } from '@/lib/demoMode';

const LOGO = () => `${(process.env.NEXT_PUBLIC_APP_URL || 'https://app.appointmentlyy.com').replace(/\/$/, '')}/appointmentlyy-logo.png`;

export const INVITE_TTL_SECONDS = 7 * 24 * 3600;
export const LOGIN_TTL_SECONDS = 15 * 60;

/**
 * Demo builds (NEXT_PUBLIC_DEMO_LOGIN=1) may show links on screen; real ones only email them.
 * Follows the production guard in lib/demoMode (never on in production unless explicitly allowed).
 */
export const isDemoLogin = () => DEMO_LOGIN;

type InviteSent = { delivered: boolean; inviteUrl: string; error?: string };

/**
 * The delivery part of an invite or re-invite response. An invite link signs in as the invitee, so
 * it only ever goes to the invitee's inbox. Platform staff may get it back when the email fails
 * (to pass on another way); nobody else ever sees the link or its token: they get
 * `emailSent: false` and the resend action instead.
 */
export function inviteDelivery(sent: InviteSent, opts: { staff: boolean; memberId: string }) {
  if (sent.delivered) return { emailDelivered: true, emailSent: true };
  if (opts.staff) return { emailDelivered: false, emailSent: false, inviteUrl: sent.inviteUrl, deliveryError: sent.error };
  return {
    emailDelivered: false,
    emailSent: false,
    deliveryError: 'The invite email could not be sent right now.',
    resend: { method: 'PATCH', path: `/api/tenant/members/${encodeURIComponent(opts.memberId)}`, body: { resend: true } },
  };
}

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
