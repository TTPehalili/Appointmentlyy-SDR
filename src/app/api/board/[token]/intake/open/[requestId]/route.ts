import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { fail } from '@/lib/server/agreements/core';
import { cpFail, projectByToken } from '@/lib/server/clientProjects/http';
import { clientOpenLink } from '@/lib/server/clientProjects/intake';

type Ctx = { params: Promise<{ token: string; requestId: string }> };

/**
 * GET /api/board/:token/intake/open/:requestId   (public; the link token is the credential)
 * "Open to sign / confirm" and "View billing statement": a redirect to the linked envelope's signer page, resolved at
 * click time. The signer link never sits in the board's JSON, and signing still needs the code emailed to the signer.
 */
export async function GET(req: NextRequest, c: Ctx) {
  const { token, requestId } = await c.params;
  const found = await projectByToken(req, token);
  if (found instanceof NextResponse) return found;
  if (!rateLimit(`cp-intake-open:${found.tokenKey}`, 60, 10 * 60_000) || !rateLimit(`cp-intake-open-ip:${found.ip}`, 30, 10 * 60_000)) return fail(429, 'Too many requests. Wait a few minutes and try again.');
  try {
    const url = await clientOpenLink(found.project, requestId, req.nextUrl.origin);
    return NextResponse.redirect(url, { status: 303, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch (err) {
    return cpFail(err, 'board intake open');
  }
}
