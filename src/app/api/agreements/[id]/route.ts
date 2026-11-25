import { NextRequest, NextResponse } from 'next/server';
import { getAgreementStore, isEnvelopeId, CC_UNAVAILABLE_MESSAGE } from '@/lib/server/agreementStore';
import {
  cleanFieldValues,
  cleanRecipient,
  clientIp,
  fail,
  findTemplate,
  json,
  metaOf,
  newCcId,
  readJson,
  requireOwner,
  templateSummary,
  userAgentOf,
  validateAccess,
  validateCopies,
} from '@/lib/server/agreements/core';
import { AgreementError, changeAccess, expireIfDue, needsCompletion } from '@/lib/server/agreements/service';
import { AGREEMENT_LIMITS, copyStatuses, toEnvelopeView, viewRows, type CcRecipient } from '@/lib/agreements/envelope';

type Ctx = { params: Promise<{ id: string }> };
const notFound = () => fail(404, 'Document not found.');

/** GET /api/agreements/:id -> the envelope, its event timeline and which files exist (owner only). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const { id } = await ctx.params;
  if (!isEnvelopeId(id)) return notFound();
  const store = getAgreementStore();
  const found = await store.getEnvelope(id);
  if (!found) return notFound();
  // Expiry is enforced on read (the list sweep runs at most once a minute, after the response).
  const e = await expireIfDue(found);
  const events = await store.listEvents(id);
  const t = findTemplate(e.templateId);
  const view = toEnvelopeView(e);
  return json({
    success: true,
    envelope: view,
    events,
    // Copy recipients: email status and their own views (never part of `views` or the signer's counters).
    copies: copyStatuses(view.cc, events),
    copiesAvailable: await store.ccSupported(),
    template: t ? templateSummary(t) : null,
    views: viewRows(events, e.visitStats ?? {}, e.templateId),
    needsCompletion: needsCompletion(e),
    files: { original: Boolean(e.originalSha256), final: Boolean(e.finalSha256), certificate: Boolean(e.finalSha256) && e.templateMeta?.action !== 'view' },
  });
}

/**
 * PATCH /api/agreements/:id
 * Draft: { values?, recipient?, cc?, access? }. Sent but unsigned (or expired): { access } only.
 * Copies are removed after sending with POST /api/agreements/:id/remove-copy.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const { id } = await ctx.params;
  if (!isEnvelopeId(id)) return notFound();
  const body = await readJson(req, 2 * 1024 * 1024);
  if (!body) return fail(400, 'Send the changes as JSON.');
  const store = getAgreementStore();
  const e = await store.getEnvelope(id);
  if (!e) return notFound();
  const meta = { ip: clientIp(req), userAgent: userAgentOf(req), origin: req.nextUrl.origin };
  try {
    if (e.status === 'draft') {
      const t = findTemplate(e.templateId);
      if (!t) return fail(409, 'This template is not available on the server any more.');
      const access = validateAccess(body.access ?? {}, e.access);
      if (!access.ok) return fail(400, access.error);
      const values = 'values' in body ? cleanFieldValues(t, body.values) : e.fieldValues;
      const recipient = 'recipient' in body ? cleanRecipient(body.recipient) : e.recipient;
      // Copies: the new list, or the current one checked against a changed signer email.
      const copies = validateCopies('cc' in body ? body.cc : e.cc, recipient.email);
      if (!copies.ok) return fail(400, copies.error);
      let ccPatch: { cc?: CcRecipient[] } = {};
      if ('cc' in body) {
        if (copies.value.length && !(await store.ccSupported())) return fail(409, CC_UNAVAILABLE_MESSAGE, { code: 'cc_unavailable' });
        // Keep the id of an unchanged address; new addresses get a new id.
        const now = new Date().toISOString();
        const cc: CcRecipient[] = copies.value.map((c) => {
          const was = e.cc.find((x) => x.email === c.email && !x.removedAt);
          return was ? { ...was, name: c.name } : { id: newCcId(), name: c.name, email: c.email, tokenHash: null, tokenSealed: null, addedAt: now, removedAt: null };
        });
        if (cc.length || e.cc.length) ccPatch = { cc };
      }
      const updated = await store.updateEnvelope(
        id,
        {
          fieldValues: values,
          title: (t.title(values) || t.name).slice(0, AGREEMENT_LIMITS.titleMax),
          templateMeta: metaOf(t, values),
          recipient,
          ...ccPatch,
          access: access.value,
        },
        ['draft'],
      );
      if (!updated) return fail(409, 'This document was sent meanwhile. Reload.');
      return json({ success: true, envelope: toEnvelopeView(updated) });
    }
    if (!['sent', 'opened', 'expired'].includes(e.status)) return fail(409, 'Link rules can only change before the client signs.');
    if (!('access' in body)) return fail(400, 'Only the link rules can change after sending.');
    const access = validateAccess(body.access, e.access);
    if (!access.ok) return fail(400, access.error);
    const updated = await changeAccess(e, access.value, owner.email, meta);
    return json({ success: true, envelope: toEnvelopeView(updated) });
  } catch (err) {
    if (err instanceof AgreementError) return fail(err.status, err.message);
    console.error('[agreements/:id PATCH]', err);
    return fail(500, 'Could not save the changes.');
  }
}

/** DELETE /api/agreements/:id -> drafts only (sent documents are evidence: revoke them instead). */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const { id } = await ctx.params;
  if (!isEnvelopeId(id)) return notFound();
  const store = getAgreementStore();
  const e = await store.getEnvelope(id);
  if (!e) return notFound();
  if (e.status !== 'draft') return fail(409, 'Only drafts can be deleted. Revoke a sent document instead.');
  await store.deleteEnvelope(id);
  return json({ success: true });
}
