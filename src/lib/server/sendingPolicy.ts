/**
 * Safety switch for outbound email (server-only).
 *
 * Client workspaces can't send yet: until a workspace connects its own mailbox (Google Workspace or
 * its own Resend domain, coming in Admin › Integrations), email would go out from the platform's
 * address under the owner's name. So sending is paused for every workspace except the platform's
 * own (APPOINTMENTLYY, the demo workspace). Drafting, Copilot and copying still work everywhere.
 *
 * The sender is decided here, on the server, from the signed-in person and the workspace's
 * configured sender (RESEND_FROM_EMAIL). A From, Reply-To or sending domain in the request body is
 * ignored, so nobody can send as another address. Every role may send (Reps send the after-call
 * email and Inbox replies).
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getServerSession, type ServerSession } from '@/lib/server/session';
import { isDemoSession } from '@/lib/demoMode';
import { getResendFromEmail, getResendInboundEmail } from '@/lib/resendConfig';

export const EMAIL_NOT_CONNECTED_MESSAGE =
  'Sending is paused for this workspace until your email is connected in Admin › Integrations. You can still draft and copy emails.';

/** The signed-in sender, or the response to send back if this request may NOT send email. */
export async function requireSendingSession(req: NextRequest): Promise<{ session: ServerSession } | { blocked: NextResponse }> {
  const session = await getServerSession(req);
  if (!session) {
    return { blocked: NextResponse.json({ error: 'Please sign in again.', message: 'Please sign in again.' }, { status: 401 }) };
  }
  if (isDemoSession(session)) return { session };
  return {
    blocked: NextResponse.json(
      { status: 'error', code: 'EMAIL_NOT_CONNECTED', error: EMAIL_NOT_CONNECTED_MESSAGE, message: EMAIL_NOT_CONNECTED_MESSAGE },
      { status: 409 },
    ),
  };
}

/** Returns a response to send back if this request may NOT send email; null if sending is allowed. */
export async function blockUnconnectedSending(req: NextRequest): Promise<NextResponse | null> {
  const r = await requireSendingSession(req);
  return 'blocked' in r ? r.blocked : null;
}

export interface ServerSender {
  /** "Name <address>", ready for the provider. */
  from: string;
  address: string;
  name: string;
  /** Replies land in the shared inbound mailbox and with the person who sent it. */
  replyTo: string[];
}

const ADDRESS_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;

function parseMailbox(raw: string): { name: string; address: string } {
  const m = raw.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/);
  const address = (m ? m[2] : raw).trim().toLowerCase();
  return { name: (m?.[1] || '').trim(), address };
}

/** A display name that can't break out of the From header. */
const cleanDisplayName = (v: string) => v.replace(/[<>"\\\r\n\t,;]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

/**
 * From and Reply-To for mail sent by this person. The address is the workspace's configured
 * sender, or the person's own address when it is on that sender's (verified) domain; the name is
 * the person's own. Nothing comes from the request.
 */
export function serverSender(session: Pick<ServerSession, 'email' | 'name'>): ServerSender {
  const configured = parseMailbox(getResendFromEmail());
  const domain = configured.address.split('@')[1] || '';
  const own = (session.email || '').trim().toLowerCase();
  const address = domain && ADDRESS_RE.test(own) && own.endsWith(`@${domain}`) ? own : configured.address;
  const name = cleanDisplayName(session.name || '') || cleanDisplayName(configured.name) || 'Appointmentlyy';
  const inbound = getResendInboundEmail();
  const personal = ADDRESS_RE.test(own) ? own : address;
  return { from: `${name} <${address}>`, address, name, replyTo: Array.from(new Set([inbound, personal])) };
}
