import { NextRequest, NextResponse } from 'next/server';
import { LEAD_ACTIVITY_EVENT_TYPE, LEAD_ACTIVITY_LIMITS, type LeadActivityReport } from '@/lib/integrations';
import { getIntegrationStore } from '@/lib/server/integrationStore';
import { fail, json, requireMember } from '@/lib/server/integrations/api';
import {
  buildLeadActivityRows,
  LEAD_ACTIVITY_CLOCK_SKEW_MS,
  LEAD_ACTIVITY_LATE_ARRIVAL_MS,
  LEAD_ACTIVITY_OPTIONS,
  parseLeadActivityQuery,
} from '@/lib/server/integrations/leadActivityReport';
import { hasRank } from '@/lib/server/session';
import { getTenantStore } from '@/lib/server/tenantStore';
import { limitPerUser } from '@/lib/server/userRateLimit';

/**
 * GET /api/activity/lead-activity?from=<ISO>&to=<ISO>&member=<email>&tz=<minutes ahead of UTC>
 * Activity checklist ticks by person, lead and day, for the Reports page.
 *
 * - The workspace ALWAYS comes from the session; nothing in the request can change it.
 * - Supervisor and above see everyone in their workspace (optionally one `member`).
 *   Everyone else sees only their own rows: `member` is ignored for them.
 * - A lead's phone and email are never returned.
 * - Storage trouble is a plain 503 ("not available right now"), never a stack trace.
 */
export async function GET(req: NextRequest) {
  const session = await requireMember(req);
  if (session instanceof NextResponse) return session;
  const limited = limitPerUser('lead-activity', session, { maxRequests: LEAD_ACTIVITY_LIMITS.requestsPerMinute });
  if (limited) return limited;

  const q = parseLeadActivityQuery(req.nextUrl.searchParams);
  if (!q.ok) return fail(400, q.error, q.field);

  const me = session.email.trim().toLowerCase();
  const canSeeEveryone = hasRank(session, 'Supervisor');
  try {
    let members: LeadActivityReport['members'] = [{ email: me, name: session.name || me }];
    let only = me;
    // The person filter also goes to the store, BEFORE the row cap: otherwise a busy workspace (or one
    // person sending thousands of ticks) would push this person's rows past the cap and out of the answer.
    let actorEmails: string[] | undefined = [...new Set([session.email, me])];
    if (canSeeEveryone) {
      const list = (await getTenantStore().listMembers({ tenantCode: session.tenantCode })).filter((m) => m.status !== 'removed');
      members = list.map((m) => ({ email: m.email.toLowerCase(), name: m.name || m.email })).sort((a, b) => a.name.localeCompare(b.name));
      if (!members.some((m) => m.email === me)) members.unshift({ email: me, name: session.name || me });
      only = '';
      actorEmails = undefined;
      if (q.member) {
        if (!members.some((m) => m.email === q.member)) return fail(400, 'Pick someone from this workspace.', 'member');
        only = q.member;
        const saved = q.member === me ? session.email : list.find((m) => m.email.toLowerCase() === q.member)?.email;
        actorEmails = [...new Set([saved || q.member, q.member])];
      }
    }
    const names = new Map(members.map((m) => [m.email, m.name]));

    // Events are indexed by when the server received them; a tick can arrive later than it happened.
    const events = await getIntegrationStore().listEventsByType({
      tenantCode: session.tenantCode,
      type: LEAD_ACTIVITY_EVENT_TYPE,
      from: new Date(Date.parse(q.from) - LEAD_ACTIVITY_CLOCK_SKEW_MS).toISOString(),
      to: new Date(Date.parse(q.to) + LEAD_ACTIVITY_LATE_ARRIVAL_MS).toISOString(),
      limit: LEAD_ACTIVITY_LIMITS.maxRows,
      actorEmails,
    });
    const report: LeadActivityReport = {
      from: q.from,
      to: q.to,
      canSeeEveryone,
      members,
      activities: LEAD_ACTIVITY_OPTIONS,
      reps: buildLeadActivityRows(events, { from: q.from, to: q.to, tzOffsetMin: q.tzOffsetMin, only, nameOf: (email) => names.get(email) }),
      truncated: events.length >= LEAD_ACTIVITY_LIMITS.maxRows,
    };
    return json({ success: true, ...report }, 200, { 'Cache-Control': 'private, no-store', Vary: 'Cookie' });
  } catch (err) {
    console.error('[activity/lead-activity GET]', (err as Error).message);
    return json({ success: false, unavailable: true, error: "Activity isn't available right now. Please try again in a few minutes." }, 503);
  }
}
