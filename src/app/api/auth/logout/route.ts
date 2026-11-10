import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/server/session';

/** POST /api/auth/logout: clears the session cookie. */
export async function POST() {
  const res = NextResponse.json({ success: true });
  clearSessionCookie(res);
  return res;
}
