import { NextRequest, NextResponse } from 'next/server';
import { newId, nowIso } from '@/lib/server/tenantStore';
import { getIntegrationStore } from '@/lib/server/integrationStore';
import { fail, isUuid, json, requireIntegrationAdmin } from '@/lib/server/integrations/api';
import { deliverOne } from '@/lib/server/integrations/deliver';
import { limiter } from '@/lib/server/integrations/rateLimit';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/integrations/webhooks/:id/test -> { result: DeliveryAttemptResult }  (Admin+)
 * Sends a signed 'test.ping' now (even if the endpoint is turned off) and records it in the delivery
 * log. Never retried and never counted towards auto-disable.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await requireIntegrationAdmin(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  if (!isUuid(id)) return fail(404, 'Webhook endpoint not found.');
  try {
    const store = getIntegrationStore();
    const endpoint = await store.getEndpoint(session.tenantCode, id);
    if (!endpoint) return fail(404, 'Webhook endpoint not found.');

    const allowed = limiter('webhook-test', 10, 60_000).take(`${session.tenantCode}|${id}`);
    if (!allowed.ok) {
      const seconds = Math.ceil(allowed.retryAfterMs / 1000);
      return fail(429, `Too many test pings. Try again in ${seconds}s.`, undefined, { 'Retry-After': String(seconds) });
    }

    const contact = { name: 'Test Contact', company: 'Appointmentlyy test' };
    const { delivery } = await store.createDirectDelivery(
      {
        tenantCode: session.tenantCode,
        type: 'test.ping',
        idempotencyKey: `test.ping:${newId()}`,
        payload: {
          type: 'test.ping',
          occurredAt: nowIso(),
          workspace: { code: session.tenantCode, name: session.identity.tenant.name },
          actor: { email: session.email, name: session.name },
          data: { contact },
          version: 1,
        },
        actorEmail: session.email,
        schemaVersion: 1,
        source: 'test',
        subjectKey: null,
      },
      endpoint,
      'Test ping',
    );
    const { result } = await deliverOne(delivery, { workerId: null, testPing: true });
    return json({ success: true, result });
  } catch (err) {
    console.error('[integrations/webhooks/:id/test POST]', (err as Error).message);
    return fail(500, 'Could not send the test ping.');
  }
}
