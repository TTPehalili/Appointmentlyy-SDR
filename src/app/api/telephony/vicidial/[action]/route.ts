import { NextRequest, NextResponse } from 'next/server';
import {
  buildAgentUrl,
  buildNonAgentUrl,
  callVicidial,
  formatCallbackDatetime,
  getVicidialConfig,
  isValidAgentUser,
  isValidStatusCode,
  parseAgentStatus,
  splitPhone,
  VicidialUnreachableError,
} from '@/lib/server/vicidial';
import { getServerSession, hasRank } from '@/lib/server/session';
import { getTelephonyAgentStore } from '@/lib/server/telephonyAgentStore';
import { ownAgentUser, resolveAgentUser, telephonyAllowed } from '@/lib/server/telephonyAccess';

/**
 * Relay between the Dialer and VICIdial. Credentials stay on the server. Every call needs a live
 * session, a workspace allowed to use telephony (src/lib/server/telephonyAccess.ts), and an agent
 * username the caller may act as: their own (linked by an Admin in Admin › Phone system), or, for
 * Supervisors and above, one linked in their workspace. The body's agentUser is optional.
 *
 * POST /api/telephony/vicidial/{config|test|status|dial|hangup|disposition}
 */

interface Body {
  agentUser?: string;
  phone?: string;
  leadId?: string;
  status?: string;
  callback?: { dueAt?: string; note?: string; userOnly?: boolean };
}

const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  const session = await getServerSession(req);
  if (!session) return json({ ok: false, message: 'Please sign in again.' }, 401);
  const cfg = getVicidialConfig();
  const allowed = telephonyAllowed(session);

  if (action === 'config') {
    // Workspaces not allowed to use telephony see 'not configured', so the Dialer keeps tel: links.
    const on = Boolean(cfg) && allowed;
    return json({
      ok: true,
      configured: on,
      host: on && cfg ? new URL(cfg.baseUrl).host : null,
      agentUser: on ? await ownAgentUser(session) : null,
    });
  }
  if (!cfg) {
    return json({ ok: false, configured: false, message: 'VICIdial is not configured on this server.' }, 503);
  }
  if (!allowed) {
    return json({ ok: false, configured: false, message: 'Telephony is not enabled for this workspace.' }, 403);
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    // empty body is fine for "test"
  }
  try {
    if (action === 'test') {
      if (!hasRank(session, 'Admin')) return json({ ok: false, configured: true, message: 'Only workspace admins can test the connection.' }, 403);
      const agentUser = body.agentUser;
      if (isValidAgentUser(agentUser) && !session.isPlatformAdmin) {
        const link = await getTelephonyAgentStore().getByAgentUser(agentUser);
        if (link && link.tenantCode !== session.tenantCode) {
          return json({ ok: false, configured: true, message: 'That VICIdial agent belongs to another workspace.' }, 403);
        }
      }
      const version = await callVicidial(buildNonAgentUrl(cfg, 'version'));
      if (!version.ok) return json({ ok: false, configured: true, message: `API login failed: ${version.message}` });
      let agent: ReturnType<typeof parseAgentStatus> | null = null;
      if (isValidAgentUser(agentUser)) {
        agent = parseAgentStatus(await callVicidial(buildNonAgentUrl(cfg, 'agent_status', { agent_user: agentUser })));
      }
      const ver = /VERSION:\s*([^|]+)/i.exec(version.message)?.[1]?.trim();
      return json({ ok: true, configured: true, message: ver ? `VICIdial ${ver}.` : version.message, agent });
    }

    const who = await resolveAgentUser(session, body.agentUser);
    if ('status' in who) return json({ ok: false, configured: true, message: who.message }, who.status);
    const agentUser = who.agentUser;

    switch (action) {
      case 'status': {
        const reply = await callVicidial(buildNonAgentUrl(cfg, 'agent_status', { agent_user: agentUser }), 6000);
        return json({ ok: true, configured: true, ...parseAgentStatus(reply) });
      }
      case 'dial': {
        const split = splitPhone(body.phone || '');
        if (!split) return json({ ok: false, configured: true, message: 'This phone number is not valid for dialing.' }, 400);
        const params: Record<string, string> = {
          value: split.number, phone_code: split.phoneCode, search: 'YES', preview: 'NO', focus: 'YES',
        };
        const vendor = (body.leadId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 50);
        if (vendor) params.vendor_id = vendor;
        const reply = await callVicidial(buildAgentUrl(cfg, agentUser, 'external_dial', params));
        return json({ ok: reply.ok, configured: true, message: friendly(reply.message, reply.ok) });
      }
      case 'hangup': {
        const reply = await callVicidial(buildAgentUrl(cfg, agentUser, 'external_hangup', { value: '1' }));
        return json({ ok: reply.ok, configured: true, message: friendly(reply.message, reply.ok) });
      }
      case 'disposition': {
        if (!isValidStatusCode(body.status)) {
          return json({ ok: false, configured: true, message: 'Outcome has no valid VICIdial status code.' }, 400);
        }
        const params: Record<string, string> = { value: body.status.toUpperCase() };
        if (body.callback?.dueAt) {
          const when = formatCallbackDatetime(body.callback.dueAt, cfg.timeZone);
          if (when) {
            params.callback_datetime = when;
            params.callback_type = body.callback.userOnly ? 'USERONLY' : 'ANYONE';
            if (body.callback.note) params.callback_comments = body.callback.note.replace(/[\r\n]+/g, ' ').slice(0, 200);
          }
        }
        const reply = await callVicidial(buildAgentUrl(cfg, agentUser, 'external_status', params));
        return json({ ok: reply.ok, configured: true, message: friendly(reply.message, reply.ok) });
      }
      default:
        return json({ ok: false, configured: true, message: `Unknown action "${action}".` }, 404);
    }
  } catch (err) {
    if (err instanceof VicidialUnreachableError) {
      return json({ ok: false, configured: true, unreachable: true, message: err.message }, 502);
    }
    return json({ ok: false, configured: true, message: 'Unexpected error talking to VICIdial.' }, 500);
  }
}

/** Turn VICIdial's terse replies into something a rep can act on. */
function friendly(message: string, ok: boolean): string {
  if (ok) return message || 'Done';
  if (/not logged in/i.test(message)) return 'You are not logged in to your VICIdial agent screen.';
  if (/not paused|agent is not in.*paused|agent is not paused/i.test(message)) return 'Pause your VICIdial agent screen before dialing.';
  if (/invalid username|login incorrect|not allowed/i.test(message)) return 'VICIdial rejected the API login. Ask IT to check the API user.';
  return message || 'VICIdial reported an error.';
}
