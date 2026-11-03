import { NextRequest, NextResponse } from 'next/server';
import {
  signAuthToken,
  getAppBaseUrl,
  getAdminEmails,
  rateLimit,
} from '@/lib/authToken';
import { resolveTenantFromEmail } from '@/lib/tenantResolver';
import { sendAuthEmail } from '@/lib/authMailer';
import { buildLoginEmailHtml, buildLoginEmailSubject, LoginEmailParams } from '@/lib/loginEmail';
import { formatRepNameFromEmail, normalizeUserRole } from '@/lib/session';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * POST /api/auth/send-link  { email, kind?, role?, workspaceName?, invitedBy? }
 * Generates a signed login/invite link, dispatches the techy HTML login email via Resend,
 * and returns the rendered email preview + loginUrl so the user can also inspect or click
 * the login button directly in the demo modal.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || '').trim().toLowerCase();
    const kind: 'login' | 'invite' = body?.kind === 'invite' ? 'invite' : 'login';

    if (!EMAIL_RE.test(email) || email.length > 254) {
      return NextResponse.json(
        { success: false, error: 'Please enter a valid work email.' },
        { status: 400 }
      );
    }

    const ip = (req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
    if (!rateLimit(`ip:${ip}`, 30, 10 * 60_000) || !rateLimit(`email:${email}`, 12, 10 * 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please wait a few minutes and try again.' },
        { status: 429 }
      );
    }

    const tenant = resolveTenantFromEmail(email);
    const isAdmin = getAdminEmails().includes(email);
    const requestedRole = body?.role ? normalizeUserRole(body.role) : isAdmin ? 'Super Admin' : 'Rep';
    const workspaceName = String(body?.workspaceName || '').trim() || tenant.name;
    const repName = String(body?.recipientName || '').trim() || formatRepNameFromEmail(email);
    const invitedBy = String(body?.invitedBy || 'Emil Halili (Appointmentlyy)').trim();

    const token = signAuthToken(
      {
        typ: kind,
        email,
        role: requestedRole,
        tenantName: workspaceName,
        tenantCode: tenant.code,
        repName,
      },
      kind === 'invite' ? 72 * 3600 : 15 * 60
    );

    const origin = req.nextUrl.origin;
    const base = getAppBaseUrl(origin);
    const loginUrl = `${origin}/login/verify?token=${encodeURIComponent(token)}`;
    const productionLoginUrl = `${base}/login/verify?token=${encodeURIComponent(token)}`;

    const emailParams: LoginEmailParams = {
      kind,
      recipientName: repName.split(' ')[0] || 'there',
      workspaceName,
      role: requestedRole,
      loginUrl,
      expiresText: kind === 'invite' ? '72 hours' : '15 minutes',
      invitedBy,
      logoUrl: `${origin}/appointmentlyy-logo.png`,
    };

    const emailHtml = buildLoginEmailHtml(emailParams);
    const emailSubject = buildLoginEmailSubject(emailParams);

    const sent = await sendAuthEmail(email, {
      ...emailParams,
      logoUrl: `${(process.env.NEXT_PUBLIC_APP_URL || 'https://app.appointmentlyy.com').replace(/\/$/, '')}/appointmentlyy-logo.png`,
    });

    return NextResponse.json({
      success: true,
      emailDelivered: sent.ok,
      deliveryWarning: sent.ok ? undefined : sent.error,
      loginUrl,
      productionLoginUrl,
      emailSubject,
      emailHtml,
      recipient: {
        email,
        repName,
        role: requestedRole,
        workspaceName,
      },
    });
  } catch (err) {
    console.error('[Auth send-link]', err);
    return NextResponse.json(
      { success: false, error: 'Login link service is temporarily unavailable.' },
      { status: 500 }
    );
  }
}
