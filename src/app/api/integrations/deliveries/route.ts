import { NextRequest, NextResponse } from 'next/server';
import type { DeliveryStatusView } from '@/lib/integrations';
import { getIntegrationStore } from '@/lib/server/integrationStore';
import { DELIVERY_STATUSES, deliveryView, fail, isUuid, json, requireIntegrationAdmin } from '@/lib/server/integrations/api';

/** GET /api/integrations/deliveries?status=&endpointId=&limit= -> { deliveries: DeliveryView[] } newest first (Admin+). */
export async function GET(req: NextRequest) {
  const session = await requireIntegrationAdmin(req);
  if (session instanceof NextResponse) return session;
  const q = req.nextUrl.searchParams;
  const status = q.get('status') || undefined;
  if (status && !DELIVERY_STATUSES.includes(status as DeliveryStatusView)) return fail(400, `status must be one of: ${DELIVERY_STATUSES.join(', ')}.`, 'status');
  const endpointId = q.get('endpointId') || undefined;
  if (endpointId && !isUuid(endpointId)) return fail(400, 'endpointId must be an endpoint id.', 'endpointId');
  const rawLimit = q.get('limit');
  const limit = rawLimit ? Number(rawLimit) : 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return fail(400, 'limit must be a whole number from 1 to 200.', 'limit');

  try {
    const store = getIntegrationStore();
    const [deliveries, endpoints] = await Promise.all([
      store.listDeliveries({ tenantCode: session.tenantCode, status: status as DeliveryStatusView | undefined, endpointId, limit }),
      store.listEndpoints(session.tenantCode),
    ]);
    const urls = new Map(endpoints.map((e) => [e.id, e.url]));
    return json({ success: true, deliveries: deliveries.filter((d) => d.destinationKind === 'webhook').map((d) => deliveryView(d, urls)) });
  } catch (err) {
    console.error('[integrations/deliveries GET]', (err as Error).message);
    return fail(500, 'Could not load the delivery log.');
  }
}
