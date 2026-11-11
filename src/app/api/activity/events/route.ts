import { after, NextRequest, NextResponse } from 'next/server';
import { INTEGRATION_LIMITS } from '@/lib/integrations';
import { getIntegrationStore } from '@/lib/server/integrationStore';
import { fail, json, readJsonBody, requireMember } from '@/lib/server/integrations/api';
import { eventSummary, payloadOf, subjectKeyOf, validateEventBatch } from '@/lib/server/integrations/eventInput';
import { limiter } from '@/lib/server/integrations/rateLimit';
import { nudgeDeliveryWorker } from '@/lib/server/integrations/worker';

const MAX_BODY_BYTES = 256 * 1024;
const EVENTS_PER_MINUTE = 120;

/**
 * POST /api/activity/events  body { events: ActivityEventInput[] } (1..20), any signed-in member.
 * Stores each event once (idempotent on clientEventId per workspace) and queues one delivery per
 * subscribed, active webhook endpoint. -> { accepted: string[]; duplicates: string[] }
 */
export async function POST(req: NextRequest) {
  const session = await requireMember(req);
  if (session instanceof NextResponse) return session;

  const body = await readJsonBody(req, MAX_BODY_BYTES);
  if (body === 'too_large') return fail(413, 'That request is too large. Send fewer events at a time.', 'events');
  if (!body) return fail(400, 'Send the events as JSON: { events: [...] }.', 'events');
  if (Array.isArray(body.events) && body.events.length > INTEGRATION_LIMITS.eventsPerRequest) {
    return fail(413, `Send at most ${INTEGRATION_LIMITS.eventsPerRequest} events per request.`, 'events');
  }
  const checked = validateEventBatch(body);
  if (!checked.ok) return fail(400, checked.error, checked.field);
  const events = checked.value;

  const allowed = limiter('activity-events', EVENTS_PER_MINUTE, 60_000).take(`${session.tenantCode}|${session.email.toLowerCase()}`, events.length);
  if (!allowed.ok) {
    const seconds = Math.ceil(allowed.retryAfterMs / 1000);
    return fail(429, `Too many activity events. Try again in ${seconds}s.`, undefined, { 'Retry-After': String(seconds) });
  }

  const workspace = { code: session.tenantCode, name: session.identity.tenant.name };
  const actor = { email: session.email, name: session.name };
  const store = getIntegrationStore();
  const accepted: string[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();
  let queued = 0;
  try {
    for (const e of events) {
      if (seen.has(e.clientEventId)) {
        duplicates.push(e.clientEventId);
        continue;
      }
      seen.add(e.clientEventId);
      const r = await store.recordEvent(
        {
          tenantCode: session.tenantCode,
          type: e.type,
          idempotencyKey: e.clientEventId,
          payload: payloadOf(e, workspace, actor) as unknown as Record<string, unknown>,
          actorEmail: session.email,
          schemaVersion: 1,
          source: 'browser',
          subjectKey: subjectKeyOf(e.contact),
        },
        eventSummary(e.type, e.contact),
      );
      (r.duplicate ? duplicates : accepted).push(e.clientEventId);
      queued += r.deliveries.length;
    }
  } catch (err) {
    console.error('[activity/events POST]', (err as Error).message);
    // What was stored stays stored; the browser retries the batch and gets those back as duplicates.
    return fail(500, 'Could not save the activity. It will be retried.');
  }

  if (queued > 0) after(() => nudgeDeliveryWorker());
  return json({ success: true, accepted, duplicates });
}
