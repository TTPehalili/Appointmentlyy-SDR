/**
 * Send one delivery to its destination and record the attempt. Used by the background worker
 * (claimed deliveries, with retries) and by the endpoint Test button (one-off, no retries).
 */
import type { DeliveryAttemptResult } from '@/lib/integrations';
import { getIntegrationStore, openEndpointSecret, type Delivery } from '@/lib/server/integrationStore';
import { webhookBody } from '@/lib/server/integrations/eventInput';
import { autoDisableAfter, backoffSchedule } from '@/lib/server/integrations/policy';
import { sendWebhook } from '@/lib/server/integrations/webhookSender';

export interface DeliverOptions {
  /** The worker holding the lease, or null for a direct (unclaimed) send such as a test ping. */
  workerId: string | null;
  /** Test ping: send even if the endpoint is turned off, never retry, don't touch the failure streak. */
  testPing?: boolean;
}

const skipped = (message: string): DeliveryAttemptResult => ({ ok: false, httpStatus: 0, durationMs: 0, message });

export async function deliverOne(d: Delivery, opts: DeliverOptions): Promise<{ delivery: Delivery | null; result: DeliveryAttemptResult }> {
  const store = getIntegrationStore();
  const skip = async (message: string) => ({ delivery: await store.markSkipped(d.id, message, opts.workerId), result: skipped(message) });

  if (d.destinationKind !== 'webhook' || !d.endpointId) return skip('This destination type is not supported yet.');
  const endpoint = await store.getEndpoint(d.tenantCode, d.endpointId);
  if (!endpoint) return skip('The webhook endpoint was deleted.');
  if (!endpoint.active && !opts.testPing) return skip('The webhook endpoint is turned off.');
  const event = await store.getEvent(d.eventId);
  if (!event || event.tenantCode !== d.tenantCode) return skip('The event is no longer stored.');

  let secret: string;
  try {
    secret = openEndpointSecret(endpoint);
  } catch (err) {
    console.error('[integrations] could not open a webhook signing secret', endpoint.id, (err as Error).message);
    return skip('The signing secret could not be read. Rotate the secret, then retry.');
  }

  const sent = await sendWebhook({ url: endpoint.url, secret, eventId: event.id, eventType: event.type, body: webhookBody(event.id, event.payload) });
  const { responseExcerpt, ...result } = sent;
  const delivery = await store.recordAttempt(
    d.id,
    { ...result, responseExcerpt },
    {
      workerId: opts.workerId,
      final: Boolean(opts.testPing),
      countForEndpoint: !opts.testPing,
      schedule: backoffSchedule(),
      autoDisableAfter: autoDisableAfter(),
    },
  );
  return { delivery, result };
}
