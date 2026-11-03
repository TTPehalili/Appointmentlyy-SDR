import { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_COOKIE_NAME,
  signAuthToken,
  verifyAuthToken,
} from '@/lib/authToken';

/**
 * POST /api/auth/verify  { token }
 * Validates a login/invite token, issues an httpOnly signed session cookie (7 days)
 * and returns the identity the client should adopt.
 */
export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json().catch(() => ({ token: '' }));
    const payload = verifyAuthToken(token, ['login', 'invite']);

    if (!payload) {
      return NextResponse.json(
        { success: false, error: 'This login link is invalid or has expired. Request a new one.' },
        { status: 401 }
      );
    }

    const sessionToken = signAuthToken(
      {
        typ: 'session',
        email: payload.email,
        role: payload.role,
        tenantName: payload.tenantName,
        tenantCode: payload.tenantCode,
        repName: payload.repName,
      },
      7 * 24 * 3600
    );

    const res = NextResponse.json({
      success: true,
      identity: {
        email: payload.email,
        role: payload.role,
        tenantName: payload.tenantName,
        tenantCode: payload.tenantCode,
        repName: payload.repName,
      },
    });
    res.cookies.set(AUTH_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 3600,
    });
    return res;
  } catch (err) {
    console.error('[Auth verify]', err);
    return NextResponse.json(
      { success: false, error: 'Could not verify this link.' },
      { status: 500 }
    );
  }
}

