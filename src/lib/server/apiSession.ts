/**
 * Live session check for API route handlers (route files may only export handlers).
 *
 * The proxy only verifies the cookie's signature, so a removed member's cookie stays valid for up
 * to 7 days. Every handler that does work for a signed-in person calls this: it re-reads the
 * membership, workspace and credential from storage (getServerSession) and optionally checks a
 * minimum rank. Workspace and role always come from here, never from the request.
 */
import { NextResponse, type NextRequest } from 'next/server';
import type { Role } from '@/lib/roles';
import { getServerSession, hasRank, type ServerSession } from '@/lib/server/session';

/** Error body readable by every caller shape in the app ({ error }, { success }, { status, message }). */
export function apiError(status: number, error: string): NextResponse {
  return NextResponse.json(
    { success: false, status: 'error', error, message: error },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

/** The signed-in person (at least `min` rank when given), or the 401 / 403 to send. */
export async function requireApiSession(
  req: NextRequest,
  min?: Role,
  deniedMessage = 'You do not have access to this.',
): Promise<ServerSession | NextResponse> {
  const session = await getServerSession(req);
  if (!session) return apiError(401, 'Please sign in again.');
  if (min && !hasRank(session, min)) return apiError(403, deniedMessage);
  return session;
}
