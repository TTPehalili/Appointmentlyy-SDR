import { NextRequest, NextResponse } from 'next/server';
import { INTEGRATION_LIMITS } from '@/lib/integrations';
import { newId } from '@/lib/server/tenantStore';
import { getIntegrationStore, isEndpointLimitError, sealEndpointSecret } from '@/lib/server/integrationStore';
import { auditIntegration, endpointFields, endpointView, fail, json, readJsonBody, requireIntegrationAdmin } from '@/lib/server/integrations/api';
import { newSigningSecret, secretHint } from '@/lib/server/integrations/signature';
import { validateWebhookUrl } from '@/lib/server/integrations/webhookUrl';

/** GET /api/integrations/webhooks -> { endpoints } (Admin+). Secrets are never returned. */
export async function GET(req: NextRequest) {
  const session = await requireIntegrationAdmin(req);
  if (session instanceof NextResponse) return session;
  try {
    const endpoints = await getIntegrationStore().listEndpoints(session.tenantCode);
    return json({ success: true, endpoints: endpoints.map(endpointView) });
  } catch (err) {
    console.error('[integrations/webhooks GET]', (err as Error).message);
    return fail(500, 'Could not load webhook endpoints.');
  }
}

/** POST /api/integrations/webhooks  body { url, events, description? } -> 201 { endpoint, signingSecret } (secret shown once). */
export async function POST(req: NextRequest) {
  const session = await requireIntegrationAdmin(req);
  if (session instanceof NextResponse) return session;
  const body = await readJsonBody(req, 16 * 1024);
  if (body === 'too_large') return fail(413, 'That request is too large.');
  if (!body) return fail(400, 'Send the endpoint as JSON.');

  const fields = endpointFields(body, false);
  if (!fields.ok) return fail(400, fields.error, fields.field);
  const url = await validateWebhookUrl(body.url);
  if (!url.ok) return fail(400, url.error, 'url');

  try {
    const store = getIntegrationStore();
    const id = newId();
    const signingSecret = newSigningSecret();
    const endpoint = await store.insertEndpoint(
      {
        id,
        tenantCode: session.tenantCode,
        url: url.url,
        events: fields.value.events!,
        description: fields.value.description ?? '',
        secretSealed: sealEndpointSecret(id, signingSecret),
        secretHint: secretHint(signingSecret),
        createdBy: session.email,
      },
      INTEGRATION_LIMITS.endpointsPerWorkspace,
    );
    await auditIntegration(session, 'webhook.create', endpoint.id, { url: endpoint.url, events: endpoint.events });
    return json({ success: true, endpoint: endpointView(endpoint), signingSecret }, 201);
  } catch (err) {
    if (isEndpointLimitError(err)) return fail(409, err.message);
    console.error('[integrations/webhooks POST]', (err as Error).message);
    return fail(500, 'Could not save the webhook endpoint.');
  }
}
