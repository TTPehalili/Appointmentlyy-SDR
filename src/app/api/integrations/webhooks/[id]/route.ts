import { NextRequest, NextResponse } from 'next/server';
import { getIntegrationStore, sealEndpointSecret, type EndpointPatch } from '@/lib/server/integrationStore';
import { auditIntegration, endpointFields, endpointView, fail, isUuid, json, readJsonBody, requireIntegrationAdmin } from '@/lib/server/integrations/api';
import { newSigningSecret, secretHint } from '@/lib/server/integrations/signature';
import { validateWebhookUrl } from '@/lib/server/integrations/webhookUrl';

type Ctx = { params: Promise<{ id: string }> };
const notFound = () => fail(404, 'Webhook endpoint not found.');

/**
 * PATCH /api/integrations/webhooks/:id  body Partial<{ url, events, description }> & { active?, rotateSecret? }
 * -> { endpoint, signingSecret? } (signingSecret only when rotated; shown once). Admin+.
 * Turning an endpoint back on clears its failure streak and the auto-disable reason.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await requireIntegrationAdmin(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const body = await readJsonBody(req, 16 * 1024);
  if (body === 'too_large') return fail(413, 'That request is too large.');
  if (!body) return fail(400, 'Send the changes as JSON.');

  try {
    const store = getIntegrationStore();
    const current = await store.getEndpoint(session.tenantCode, id);
    if (!current) return notFound();

    const fields = endpointFields(body, true);
    if (!fields.ok) return fail(400, fields.error, fields.field);
    if (body.active !== undefined && typeof body.active !== 'boolean') return fail(400, 'active must be true or false.', 'active');
    if (body.rotateSecret !== undefined && typeof body.rotateSecret !== 'boolean') return fail(400, 'rotateSecret must be true or false.', 'rotateSecret');

    const patch: EndpointPatch = { ...fields.value };
    if (body.url !== undefined) {
      const url = await validateWebhookUrl(body.url);
      if (!url.ok) return fail(400, url.error, 'url');
      patch.url = url.url;
    }
    if (typeof body.active === 'boolean') {
      patch.active = body.active;
      if (body.active && !current.active) {
        patch.consecutiveFailures = 0;
        patch.disabledReason = null;
      }
      if (!body.active) patch.disabledReason = null;
    }
    let signingSecret: string | undefined;
    if (body.rotateSecret === true) {
      signingSecret = newSigningSecret();
      patch.secretSealed = sealEndpointSecret(current.id, signingSecret);
      patch.secretHint = secretHint(signingSecret);
    }
    if (Object.keys(patch).length === 0) return fail(400, 'Nothing to change.');

    const updated = await store.updateEndpoint(session.tenantCode, id, patch);
    if (!updated) return notFound();

    const changed = Object.keys(patch).filter((k) => !['secretSealed', 'secretHint', 'consecutiveFailures', 'disabledReason'].includes(k));
    if (changed.length) {
      await auditIntegration(session, 'webhook.update', id, {
        changed,
        url: updated.url,
        events: updated.events,
        active: updated.active,
        ...(patch.url && patch.url !== current.url ? { previousUrl: current.url } : {}),
      });
    }
    if (signingSecret) await auditIntegration(session, 'webhook.rotate_secret', id, { url: updated.url, secretHint: updated.secretHint });

    return json({ success: true, endpoint: endpointView(updated), ...(signingSecret ? { signingSecret } : {}) });
  } catch (err) {
    console.error('[integrations/webhooks/:id PATCH]', (err as Error).message);
    return fail(500, 'Could not update the webhook endpoint.');
  }
}

/** DELETE /api/integrations/webhooks/:id -> { success: true }. Its delivery log goes with it. Admin+. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const session = await requireIntegrationAdmin(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  try {
    const store = getIntegrationStore();
    const current = await store.getEndpoint(session.tenantCode, id);
    if (!current) return notFound();
    if (!(await store.deleteEndpoint(session.tenantCode, id))) return notFound();
    await auditIntegration(session, 'webhook.delete', id, { url: current.url, events: current.events });
    return json({ success: true });
  } catch (err) {
    console.error('[integrations/webhooks/:id DELETE]', (err as Error).message);
    return fail(500, 'Could not delete the webhook endpoint.');
  }
}
