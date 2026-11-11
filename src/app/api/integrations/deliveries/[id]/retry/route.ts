import { after, NextRequest, NextResponse } from 'next/server';
import { getIntegrationStore } from '@/lib/server/integrationStore';
import { deliveryView, fail, isUuid, json, requireIntegrationAdmin } from '@/lib/server/integrations/api';
import { nudgeDeliveryWorker } from '@/lib/server/integrations/worker';

type Ctx = { params: Promise<{ id: string }> };
const notFound = () => fail(404, 'Delivery not found.');

/**
 * POST /api/integrations/deliveries/:id/retry -> { delivery }  (Admin+)
 * failed / dead / skipped -> pending now (a dead delivery gets one more attempt). The endpoint must
 * be turned on.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await requireIntegrationAdmin(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  try {
    const store = getIntegrationStore();
    const current = await store.getDelivery(session.tenantCode, id);
    if (!current || current.destinationKind !== 'webhook' || !current.endpointId) return notFound();
    const endpoint = await store.getEndpoint(session.tenantCode, current.endpointId);
    if (!endpoint) return notFound();
    if (!endpoint.active) return fail(409, 'Turn the webhook endpoint back on first.');

    const r = await store.retryDelivery(session.tenantCode, id);
    if (!r.ok) {
      if (r.reason === 'not_found') return notFound();
      return fail(409, current.status === 'succeeded' ? 'This delivery already succeeded.' : 'This delivery is already queued.');
    }
    after(() => nudgeDeliveryWorker());
    return json({ success: true, delivery: deliveryView(r.delivery, new Map([[endpoint.id, endpoint.url]])) });
  } catch (err) {
    console.error('[integrations/deliveries/:id/retry POST]', (err as Error).message);
    return fail(500, 'Could not retry the delivery.');
  }
}
