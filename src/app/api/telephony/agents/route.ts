import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireApiSession } from '@/lib/server/apiSession';
import { getTenantStore } from '@/lib/server/tenantStore';
import { AgentTakenError, getTelephonyAgentStore } from '@/lib/server/telephonyAgentStore';
import { telephonyAllowed } from '@/lib/server/telephonyAccess';
import { isValidAgentUser } from '@/lib/server/vicidial';

/**
 * Admin › Phone system: which VICIdial agent each member of the signed-in workspace dials as.
 * GET  -> { members: [{ email, name, role, status, agentUser }], enabled }
 * PUT  { email, agentUser }  (empty agentUser unlinks)
 * Admin and above; the workspace always comes from the session.
 */
const ADMIN_ONLY = 'Only workspace admins can link VICIdial agents.';
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(req: NextRequest) {
  const session = await requireApiSession(req, 'Admin', ADMIN_ONLY);
  if (session instanceof NextResponse) return session;
  try {
    const [members, links] = await Promise.all([
      getTenantStore().listMembers({ tenantCode: session.tenantCode }),
      getTelephonyAgentStore().listForTenant(session.tenantCode),
    ]);
    const byEmail = new Map(links.map((l) => [l.email, l.agentUser]));
    return NextResponse.json(
      {
        success: true,
        enabled: telephonyAllowed(session),
        members: members
          .filter((m) => m.status !== 'removed')
          .map((m) => ({ email: m.email, name: m.name, role: m.role, status: m.status, agentUser: byEmail.get(m.email.toLowerCase()) ?? '' })),
      },
      { headers: noStore },
    );
  } catch (err) {
    console.error('[telephony agents] list', err);
    return apiError(500, 'Could not load agent links.');
  }
}

export async function PUT(req: NextRequest) {
  const session = await requireApiSession(req, 'Admin', ADMIN_ONLY);
  if (session instanceof NextResponse) return session;
  let body: { email?: unknown; agentUser?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiError(400, 'Send JSON: { email, agentUser }.');
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const agentUser = typeof body.agentUser === 'string' ? body.agentUser.trim() : '';
  if (!email) return apiError(400, 'Choose a member.');
  if (agentUser && !isValidAgentUser(agentUser)) return apiError(400, 'Use letters, numbers, dots, dashes or underscores (max 20).');

  try {
    const tenants = getTenantStore();
    const member = (await tenants.listMembers({ tenantCode: session.tenantCode, email })).find((m) => m.status !== 'removed');
    if (!member) return apiError(404, 'That person is not in this workspace.');
    const link = await getTelephonyAgentStore().set(session.tenantCode, email, agentUser, session.email);
    try {
      await tenants.addAudit({
        actorEmail: session.email,
        tenantCode: session.tenantCode,
        action: agentUser ? 'telephony.agent_link' : 'telephony.agent_unlink',
        target: email,
        detail: agentUser ? { agentUser } : {},
      });
    } catch (err) {
      console.error('[telephony agents] audit', err);
    }
    return NextResponse.json({ success: true, email, agentUser: link?.agentUser ?? '' }, { headers: noStore });
  } catch (err) {
    if (err instanceof AgentTakenError) return apiError(409, err.message);
    console.error('[telephony agents] save', err);
    return apiError(500, 'Could not save the agent link.');
  }
}
