import { NextRequest, NextResponse, after } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { getAgreementStore, AgreementStorageError, CC_UNAVAILABLE_MESSAGE, isEnvelopeId } from '@/lib/server/agreementStore';
import { isStatementTemplate, paymentField, statementDateField } from '@/lib/server/agreements/billing';
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
  welcomeChoice,
  newCcId,
  pastExpiry,
  readJson,
  requireOwner,
  templateSummary,
  userAgentOf,
  validateAccess,
  validateCopies,
} from '@/lib/server/agreements/core';
import { AgreementError, newEnvelopeRecord, sendEnvelope, sweep, sweepDue } from '@/lib/server/agreements/service';
import { mailStatus } from '@/lib/server/agreements/mail';
import { AGREEMENT_LIMITS, toEnvelopeView, type CcRecipient } from '@/lib/agreements/envelope';
import { BANK_KEYS, PAYMENT_DEFAULT_KEYS, hasBank } from '@/lib/agreements/paymentOptions';

/**
 * Agreements (platform owner only).
 * GET  /api/agreements   envelopes, templates, settings and email status
 * POST /api/agreements   { templateId, values, recipient, cc?, access, send? } -> new draft (sent when send is true)
 *                        cc: [{ name?, email }] copy recipients (view only), at most 5
 *                        welcomeEmail: false  contracts only: no welcome email when fully signed (default on)
 */
export async function GET(req: NextRequest) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  try {
    const store = getAgreementStore();
    const [rows, { settings }, ccOk] = await Promise.all([store.listEnvelopes(), loadSettings(), store.ccSupported()]);
    // Housekeeping (mark expired links, "expiring soon" notices) runs after the response, at most
    // once a minute per server, on the rows just read.
    const origin = req.nextUrl.origin;
    if (sweepDue()) after(() => sweep(origin, rows).catch((err) => console.error('[agreements sweep]', err)));
    const now = Date.now();
    return json({
      success: true,
      // A link past its expiry shows as expired straight away, even before the sweep has recorded it.
      envelopes: rows.map((e) => toEnvelopeView((e.status === 'sent' || e.status === 'opened') && pastExpiry(e, now) ? { ...e, status: 'expired' } : e)),
      templates: allTemplates().map(templateSummary),
      settings,
      mail: mailStatus(),
      storage: store.backend,
      // Copy recipients (stored in template_meta; available on both backends).
      copies: { available: ccOk, problem: ccOk ? null : CC_UNAVAILABLE_MESSAGE },
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
  const recipient = cleanRecipient(body.recipient);
  const copies = validateCopies(body.cc, recipient.email);
  if (!copies.ok) return fail(400, copies.error);
  let sourceEnvelopeId: string | null = null;
  const statement = isStatementTemplate(t);
  if (statement) {
    // Billing statements: today's date and the owner's saved payment note fill empty fields.
    const sdf = statementDateField(t);
    if (sdf && !(values[sdf.key] ?? '').trim()) values[sdf.key] = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    const pf = paymentField(t);
    if (pf && !(values[pf.key] ?? '').trim()) {
      const { settings } = await loadSettings();
      if (settings.paymentInstructions) values[pf.key] = settings.paymentInstructions;
    }
    // Payment options (Wise link, bank transfer, PayPal, QR): the settings fill empty fields. The bank
    // details are one block: filled only when the statement has none of its own (never mixed).
    const defaults = (await loadSettings()).settings;
    const bankEmpty = !hasBank(values);
    for (const k of PAYMENT_DEFAULT_KEYS) {
      if (k === 'paymentInstructions' || !t.fields.some((f) => f.key === k) || (values[k] ?? '').trim() || !defaults[k]) continue;
      if ((BANK_KEYS as readonly string[]).includes(k) && k !== 'bankCurrency' && !bankEmpty) continue;
      values[k] = defaults[k];
    }
    const src = typeof body.sourceEnvelopeId === 'string' && isEnvelopeId(body.sourceEnvelopeId) ? await getAgreementStore().getEnvelope(body.sourceEnvelopeId) : null;
    sourceEnvelopeId = src ? src.id : null;
  }
  try {
    if (copies.value.length && !(await getAgreementStore().ccSupported())) return fail(409, CC_UNAVAILABLE_MESSAGE, { code: 'cc_unavailable' });
    const addedAt = new Date().toISOString();
    const cc: CcRecipient[] = copies.value.map((c) => ({ id: newCcId(), name: c.name, email: c.email, tokenHash: null, tokenSealed: null, addedAt, removedAt: null }));
    const rec = newEnvelopeRecord({
      templateId: t.id,
      title: (t.title(values) || t.name).slice(0, AGREEMENT_LIMITS.titleMax),
      fieldValues: values,
      recipient,
      cc,
      access: access.value,
      // Contracts: "Send welcome email when fully signed" (default on); ignored for every other template.
      templateMeta: metaOf(t, values, welcomeChoice(body)),
      createdBy: owner.email,
    });
    if (statement) rec.billing = { number: '', currency: 'USD', total: 0, dueDate: null, payments: [], sourceEnvelopeId };
    const store = getAgreementStore();
    const created = await store.createEnvelope(rec);
    await store.addEvent({ envelopeId: created.id, type: 'created', ip: clientIp(req), userAgent: userAgentOf(req), data: { by: owner.email, templateId: t.id, ...(cc.length ? { copies: cc.length } : {}) } });
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
