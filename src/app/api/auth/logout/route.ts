import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, forgetSessionOf } from '@/lib/server/session';

/** POST /api/auth/logout: clears the session cookie (and this server's short memo of it). */
export async function POST(req: NextRequest) {
  forgetSessionOf(req);
  const res = NextResponse.json({ success: true });
  clearSessionCookie(res);
  return res;
}
