import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { getAgreementStore, AgreementStorageError, isEnvelopeId } from '@/lib/server/agreementStore';
import { paymentField, statementDateField } from '@/lib/server/agreements/billing';
import {
  allTemplates,
  cleanFieldValues,
  cleanRecipient,
  clientIp,
  fail,
  findTemplate,
  json,
  loadSettings,
  metaOf,
  readJson,
  requireOwner,
  templateSummary,
  userAgentOf,
  validateAccess,
} from '@/lib/server/agreements/core';
import { AgreementError, newEnvelopeRecord, sendEnvelope, sweep } from '@/lib/server/agreements/service';
import { mailStatus } from '@/lib/server/agreements/mail';
import { AGREEMENT_LIMITS, toEnvelopeView } from '@/lib/agreements/envelope';

/**
 * Agreements (platform owner only).
 * GET  /api/agreements   envelopes, templates, settings and email status
 * POST /api/agreements   { templateId, values, recipient, access, send? } -> new draft (sent when send is true)
 */
export async function GET(req: NextRequest) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  try {
    await sweep(req.nextUrl.origin).catch((err) => console.error('[agreements sweep]', err));
    const store = getAgreementStore();
    const [rows, { settings }] = await Promise.all([store.listEnvelopes(), loadSettings()]);
    return json({
      success: true,
      envelopes: rows.map(toEnvelopeView),
      templates: allTemplates().map(templateSummary),
      settings,
      mail: mailStatus(),
      storage: store.backend,
    });
  } catch (err) {
    if (err instanceof AgreementStorageError) return fail(503, 'The Agreements tables are not in the database yet. Run supabase/migrations/20261120000000_agreements.sql.');
    console.error('[agreements GET]', err);
    return fail(500, 'Could not load agreements.');
  }
}

export async function POST(req: NextRequest) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  if (!rateLimit(`agr-owner-create:${owner.email}`, 60, 10 * 60_000)) return fail(429, 'Too many documents in a short time. Wait a few minutes.');
  const body = await readJson(req, 2 * 1024 * 1024);
  if (!body) return fail(400, 'Send the document details as JSON.');
  const t = findTemplate(String(body.templateId || ''));
  if (!t) return fail(400, 'Pick a template.');
  const access = validateAccess(body.access);
  if (!access.ok) return fail(400, access.error);
  const values = cleanFieldValues(t, body.values);
  let sourceEnvelopeId: string | null = null;
  if (t.action === 'view') {
    // Billing statements: the owner's saved payment instructions (Wise) fill an empty field.
    const sdf = statementDateField(t);
    if (sdf && !(values[sdf.key] ?? '').trim()) values[sdf.key] = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    const pf = paymentField(t);
    if (pf && !(values[pf.key] ?? '').trim()) {
      const { settings } = await loadSettings();
      if (settings.paymentInstructions) values[pf.key] = settings.paymentInstructions;
    }
    const defaults = (await loadSettings()).settings;
    if (t.fields.some((f) => f.key === 'paymentLink') && !values.paymentLink && defaults.paymentLink) values.paymentLink = defaults.paymentLink;
    if (t.fields.some((f) => f.key === 'paymentQr') && !values.paymentQr && defaults.paymentQr) values.paymentQr = defaults.paymentQr;
    const src = typeof body.sourceEnvelopeId === 'string' && isEnvelopeId(body.sourceEnvelopeId) ? await getAgreementStore().getEnvelope(body.sourceEnvelopeId) : null;
    sourceEnvelopeId = src ? src.id : null;
  }
  try {
    const rec = newEnvelopeRecord({
      templateId: t.id,
      title: (t.title(values) || t.name).slice(0, AGREEMENT_LIMITS.titleMax),
      fieldValues: values,
      recipient: cleanRecipient(body.recipient),
      access: access.value,
      templateMeta: metaOf(t, values),
      createdBy: owner.email,
    });
    if (t.action === 'view') rec.billing = { number: '', currency: 'USD', total: 0, dueDate: null, payments: [], sourceEnvelopeId };
    const store = getAgreementStore();
    const created = await store.createEnvelope(rec);
    await store.addEvent({ envelopeId: created.id, type: 'created', ip: clientIp(req), userAgent: userAgentOf(req), data: { by: owner.email, templateId: t.id } });
    if (body.send !== true) return json({ success: true, envelope: toEnvelopeView(created) });
    try {
      const sent = await sendEnvelope(created.id, owner.email, { ip: clientIp(req), userAgent: userAgentOf(req), origin: req.nextUrl.origin });
      return json({ success: true, envelope: toEnvelopeView(sent.envelope), url: sent.url, email: sent.email });
    } catch (err) {
      // The draft is saved; tell the owner why it was not sent.
      if (err instanceof AgreementError) return json({ success: true, envelope: toEnvelopeView(created), sendError: err.message });
      throw err;
    }
  } catch (err) {
    if (err instanceof AgreementStorageError) return fail(503, 'The Agreements tables are not in the database yet. Run supabase/migrations/20261120000000_agreements.sql.');
    console.error('[agreements POST]', err);
    return fail(500, 'Could not save the document.');
  }
}
