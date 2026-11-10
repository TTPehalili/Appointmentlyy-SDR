/**
 * Safety switch for outbound email (server-only).
 *
 * Client workspaces can't send yet: until a workspace connects its own mailbox (Google Workspace or
 * its own Resend domain, coming in Admin › Integrations), email would go out from the platform's
 * address under the owner's name. So sending is paused for every workspace except the platform's
 * own (APPOINTMENTLYY, the demo workspace). Drafting, Copilot and copying still work everywhere.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/server/session';
import { isDemoSession } from '@/lib/demoMode';

export const EMAIL_NOT_CONNECTED_MESSAGE =
  'Sending is paused for this workspace until your email is connected in Admin › Integrations. You can still draft and copy emails.';

/** Returns a response to send back if this request may NOT send email; null if sending is allowed. */
export async function blockUnconnectedSending(req: NextRequest): Promise<NextResponse | null> {
  const session = await getServerSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Please sign in again.', message: 'Please sign in again.' }, { status: 401 });
  }
  if (isDemoSession(session)) return null;
  return NextResponse.json(
    { status: 'error', code: 'EMAIL_NOT_CONNECTED', error: EMAIL_NOT_CONNECTED_MESSAGE, message: EMAIL_NOT_CONNECTED_MESSAGE },
    { status: 409 },
  );
}
