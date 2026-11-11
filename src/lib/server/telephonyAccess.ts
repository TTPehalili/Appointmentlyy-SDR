/**
 * Who may use the shared VICIdial account through the Dialer relay (server only).
 *
 * - The workspace must be allowed to use telephony: its Dialer module is on, and it is listed in
 *   VICIDIAL_TENANTS (comma-separated workspace codes, or "*"). Unset means the platform workspace
 *   only, so a newly configured VICIdial server is never shared with every client by accident.
 * - A person may drive only the VICIdial agent an Admin linked to them in Admin › Phone system.
 *   Supervisors and above may also drive any agent linked in their own workspace; platform staff
 *   may drive any agent.
 */
import { NextResponse } from 'next/server';
import { PLATFORM_TENANT_CODE } from '@/lib/roles';
import { hasRank, type ServerSession } from '@/lib/server/session';
import { isValidAgentUser } from '@/lib/server/vicidial';
import { getTelephonyAgentStore } from '@/lib/server/telephonyAgentStore';

export function telephonyTenants(): string[] {
  const list = (process.env.VICIDIAL_TENANTS || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return list.length ? list : [PLATFORM_TENANT_CODE];
}

/** May this person's workspace use the VICIdial relay at all? */
export function telephonyAllowed(session: ServerSession): boolean {
  if (session.isPlatformAdmin) return true;
  if (session.identity.tenant.modules?.dialer === false) return false;
  const allowed = telephonyTenants();
  return allowed.includes('*') || allowed.includes(session.tenantCode.toUpperCase());
}

/** The agent linked to the signed-in person in their current workspace, if any. */
export async function ownAgentUser(session: ServerSession): Promise<string | null> {
  const link = await getTelephonyAgentStore().getForMember(session.tenantCode, session.email);
  return link?.agentUser ?? null;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The agent username this request may act as. With no username asked for, the person's own linked
 * agent. Returns the error to send when they may not.
 */
export async function resolveAgentUser(
  session: ServerSession,
  requested: unknown,
): Promise<{ agentUser: string } | { status: number; message: string }> {
  const own = await ownAgentUser(session);
  if (requested === undefined || requested === null || requested === '') {
    if (own) return { agentUser: own };
    return { status: 403, message: 'No VICIdial agent is linked to you yet. Ask an admin to link it in Admin › Phone system.' };
  }
  if (!isValidAgentUser(requested)) return { status: 400, message: 'That is not a valid VICIdial agent username.' };
  if (own && same(own, requested)) return { agentUser: own };
  if (session.isPlatformAdmin) return { agentUser: requested };
  if (hasRank(session, 'Supervisor')) {
    const link = await getTelephonyAgentStore().getByAgentUser(requested);
    if (link && link.tenantCode === session.tenantCode) return { agentUser: link.agentUser };
  }
  return { status: 403, message: 'You can only use the VICIdial agent linked to you in Admin › Phone system.' };
}

export const telephonyJson = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
