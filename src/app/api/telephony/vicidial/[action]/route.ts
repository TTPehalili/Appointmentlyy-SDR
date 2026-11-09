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

/**
 * Relay between the Dialer and VICIdial. Credentials stay on the server; the browser sends only the
 * rep's VICIdial agent username and the action's inputs.
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

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status });

export async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  const cfg = getVicidialConfig();

  if (action === 'config') {
    return json({ ok: true, configured: Boolean(cfg), host: cfg ? new URL(cfg.baseUrl).host : null });
  }
  if (!cfg) {
    return json({ ok: false, configured: false, message: 'VICIdial is not configured on this server.' }, 503);
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    // empty body is fine for "test"
  }
  const agentUser = body.agentUser;

  try {
    if (action === 'test') {
      const version = await callVicidial(buildNonAgentUrl(cfg, 'version'));
      if (!version.ok) return json({ ok: false, configured: true, message: `API login failed: ${version.message}` });
      let agent: ReturnType<typeof parseAgentStatus> | null = null;
      if (isValidAgentUser(agentUser)) {
        agent = parseAgentStatus(await callVicidial(buildNonAgentUrl(cfg, 'agent_status', { agent_user: agentUser })));
      }
      const ver = /VERSION:\s*([^|]+)/i.exec(version.message)?.[1]?.trim();
      return json({ ok: true, configured: true, message: ver ? `VICIdial ${ver}.` : version.message, agent });
    }

    if (!isValidAgentUser(agentUser)) {
      return json({ ok: false, configured: true, message: 'Set your VICIdial agent username in Settings first.' }, 400);
    }

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
