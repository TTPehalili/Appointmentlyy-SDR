import { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_COOKIE_NAME,
  verifyAuthToken,
  signAuthToken,
  getAppBaseUrl,
  rateLimit,
} from '@/lib/authToken';
import { resolveTenantFromEmail } from '@/lib/tenantResolver';
import { sendAuthEmail } from '@/lib/authMailer';
import { formatRepNameFromEmail, normalizeUserRole } from '@/lib/session';
import type { UserRole } from '@/lib/session';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Which roles each inviter may grant
const INVITABLE: Record<string, UserRole[]> = {
  'Super Admin': ['Super Admin', 'Admin', 'Manager', 'Supervisor', 'Rep'],
  Admin: ['Admin', 'Manager', 'Supervisor', 'Rep'],
  Manager: ['Supervisor', 'Rep'],
  Supervisor: ['Rep'],
};

/**
 * POST /api/auth/invite  { email, name?, role }
 * Requires a verified server session (cookie from a previous email login) held by a
 * Supervisor/Manager/Admin/Super Admin. Invitees can never receive a higher role than the inviter may grant.
 */
export async function POST(req: NextRequest) {
  try {
    const inviter = verifyAuthToken(req.cookies.get(AUTH_COOKIE_NAME)?.value, ['session']);
    if (!inviter) {
      return NextResponse.json(
        { success: false, error: 'Please sign in with your emailed login link first, then send invites.' },
        { status: 401 }
      );
    }

    const allowedRoles = INVITABLE[inviter.role];
    if (!allowedRoles) {
      return NextResponse.json(
        { success: false, error: 'Your role cannot invite users.' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || '').trim().toLowerCase();
    const role = normalizeUserRole(String(body?.role || 'Rep'));
    const name = String(body?.name || '').trim().slice(0, 80);

    if (!EMAIL_RE.test(email) || email.length > 254) {
      return NextResponse.json({ success: false, error: 'Enter a valid email address.' }, { status: 400 });
    }
    if (!allowedRoles.includes(role)) {
      return NextResponse.json(
        { success: false, error: `As ${inviter.role} you can't grant the ${role} role.` },
        { status: 403 }
      );
    }
    if (!rateLimit(`invite:${inviter.email}`, 30, 60 * 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Invite limit reached. Try again later.' },
        { status: 429 }
      );
    }

    // Super Admins may invite into other tenants by email domain; everyone else stays in their own workspace
    const tenant =
      inviter.role === 'Super Admin'
        ? resolveTenantFromEmail(email)
        : { name: inviter.tenantName, code: inviter.tenantCode };
    const repName = name || formatRepNameFromEmail(email);

    const token = signAuthToken(
      {
        typ: 'invite',
        email,
        role,
        tenantName: tenant.name,
        tenantCode: tenant.code,
        repName,
        invitedBy: inviter.repName,
      },
      7 * 24 * 3600
    );

    const base = getAppBaseUrl(req.nextUrl.origin);
    const sent = await sendAuthEmail(email, {
      kind: 'invite',
      recipientName: repName.split(' ')[0] || 'there',
      workspaceName: tenant.name,
      role,
      invitedBy: inviter.repName,
      loginUrl: `${base}/login/verify?token=${encodeURIComponent(token)}`,
      expiresText: '7 days',
      logoUrl: `${(process.env.NEXT_PUBLIC_APP_URL || 'https://app.appointmentlyy.com').replace(/\/$/, '')}/appointmentlyy-logo.png`,
    });

    if (!sent.ok) {
      return NextResponse.json(
        { success: false, error: sent.error || 'Could not send the invite email.' },
        { status: 502 }
      );
    }
    return NextResponse.json({ success: true, email, role, workspace: tenant.name });
  } catch (err) {
    console.error('[Auth invite]', err);
    return NextResponse.json({ success: false, error: 'Could not send invite.' }, { status: 500 });
  }
}

