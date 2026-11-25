import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { getAgreementStore } from '@/lib/server/agreementStore';
import { checkCcVisit, evaluateAccess, fail, fileNameFor, issueCcVisit, json, PRIVATE_HEADERS, pdfResponse, readJson } from '@/lib/server/agreements/core';
import { loadByCcToken } from '@/lib/server/agreements/publicApi';
import { copyOpensExhausted } from '@/lib/server/agreements/copyAccess';
import { qrBytes, safePaymentLink } from '@/lib/server/agreements/payment';
import { safePaypalLink } from '@/lib/agreements/paymentOptions';
import { AgreementError, recordCopyView } from '@/lib/server/agreements/service';

type Ctx = { params: Promise<{ token: string; action: string }> };

export const maxDuration = 60;

const closed = (reason: string) => fail(403, 'This link has expired or is no longer available.', { state: 'closed', reason });

/** Anything a signer does. A copy is view only: these are refused outright, before any lookup work. */
const SIGNER_ONLY = new Set(['sign', 'decline', 'otp', 'verify', 'heartbeat']);
const viewOnly = () => fail(403, 'This is a view-only copy. Only the signer can sign or respond, from their own link.', { state: 'view_only' });

/**
 * Public view-only actions for a COPY recipient (/api/sign/view/:token/...). The copy token is the
 * credential; every request re-checks the envelope's access rules. A copy can read the document and,
 * after completion, download the final copy. It can never sign, decline, ask for a one-time code or
 * add to the signer's opens, reading time or pages.
 * GET  pdf        the frozen document, during a visit (header x-agr-visit)
 * GET  download   billing statements while open (visit); the final PDF after completion
 * GET  qr         billing statements: the payment QR (visit while open)
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { token, action } = await ctx.params;
  if (SIGNER_ONLY.has(action)) return viewOnly();
  const c = await loadByCcToken(req, token);
  if (c instanceof NextResponse) return c;
  const e = c.envelope;
  const access = evaluateAccess(e);
  const store = getAgreementStore();
  const visitOk = () => Boolean(checkCcVisit(e.id, c.cc.id, req.headers.get('x-agr-visit') || req.nextUrl.searchParams.get('visit')));
  if (action === 'pdf') {
    if (access.kind !== 'open') return closed(access.kind === 'closed' ? access.reason : access.kind);
    if (!checkCcVisit(e.id, c.cc.id, req.headers.get('x-agr-visit'))) return fail(403, 'Open the link again to view the document.', { state: 'reopen' });
    const file = await store.getFile(e.id, 'original');
    if (!file) return fail(404, 'The document is not available.');
    return pdfResponse(file.bytes, fileNameFor(e, ''));
  }
  if (action === 'qr') {
    if (access.kind !== 'open' && access.kind !== 'completed') return closed(access.kind === 'closed' ? access.reason : access.kind);
    if (access.kind === 'open' && !visitOk()) return fail(403, 'Open the link again to view the document.', { state: 'reopen' });
    const png = e.templateMeta?.action === 'view' ? qrBytes(e.fieldValues.paymentQr) : null;
    if (!png) return fail(404, 'No QR code.');
    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: { ...PRIVATE_HEADERS, 'Content-Type': 'image/png', 'Content-Length': String(png.length), 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" },
    });
  }
  if (action === 'download') {
    if (access.kind === 'open' && e.templateMeta?.action === 'view') {
      if (!visitOk()) return fail(403, 'Open the link again to download the document.', { state: 'reopen' });
      const file = await store.getFile(e.id, 'original');
      if (!file) return fail(404, 'The document is not available.');
      return pdfResponse(file.bytes, fileNameFor(e, ''));
    }
    if (access.kind !== 'completed') return closed(access.kind === 'closed' ? access.reason : access.kind);
    const file = await store.getFile(e.id, 'final');
    if (!file) return fail(404, 'The signed document is not available.');
    if (rateLimit(`agr-cc-dl-log:${c.cc.id}:${c.meta.ip}`, 1, 10 * 60_000)) {
      await store.addEvent({ envelopeId: e.id, type: 'cc_downloaded', ip: c.meta.ip, userAgent: c.meta.userAgent, data: { ccId: c.cc.id } });
    }
    return pdfResponse(file.bytes, fileNameFor(e, '-signed'));
  }
  return fail(404, 'Unknown action.');
}

/**
 * POST open      {}                         -> { visit }   starts a copy's visit (not a view yet)
 * POST viewed    { visit }                               the PDF rendered in a visible tab: one copy view per visit
 * POST paylink   { provider?: 'wise'|'paypal' }          billing statements: a payment link was clicked by a copy
 * Anything a signer does (sign, decline, otp, verify, heartbeat) -> 403 view only.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { token, action } = await ctx.params;
  if (SIGNER_ONLY.has(action)) return viewOnly();
  const c = await loadByCcToken(req, token);
  if (c instanceof NextResponse) return c;
  const e = c.envelope;
  const body = await readJson(req, 16 * 1024);
  if (!body) return fail(400, 'Bad request.');
  const access = evaluateAccess(e);
  if (access.kind !== 'open') return closed(access.kind === 'closed' ? access.reason : access.kind);
  const visit = checkCcVisit(e.id, c.cc.id, body.visit);
  try {
    switch (action) {
      case 'open': {
        if (visit) return json({ success: true, visit: body.visit });
        if (await copyOpensExhausted(e, c.cc.id)) return closed('limit');
        if (!rateLimit(`agr-cc-visit-new:${c.cc.id}`, 20, 60 * 60_000)) return fail(429, 'Too many requests. Wait a few minutes and try again.');
        return json({ success: true, visit: issueCcVisit(e.id, c.cc.id) });
      }
      case 'viewed': {
        if (!visit) return fail(403, 'Open the link again.', { state: 'reopen' });
        if (!rateLimit(`agr-cc-viewed:${c.cc.id}:${visit}`, 1, 4 * 3600_000)) return json({ success: true, counted: false });
        await recordCopyView(e, c.cc, c.meta, visit);
        return json({ success: true, counted: true });
      }
      case 'paylink': {
        const provider = body.provider === undefined || body.provider === 'wise' ? 'wise' : body.provider === 'paypal' ? 'paypal' : null;
        if (!provider) return fail(400, 'Bad request.');
        const has = provider === 'paypal' ? safePaypalLink(e.fieldValues.paypalLink) : safePaymentLink(e.fieldValues.paymentLink);
        if (e.templateMeta?.action !== 'view' || !has) return fail(404, 'No payment link.');
        if (rateLimit(`agr-cc-pay-click:${c.cc.id}:${provider}:${c.meta.ip}`, 5, 10 * 60_000)) {
          await getAgreementStore().addEvent({ envelopeId: e.id, type: 'cc_pay_link_clicked', ip: c.meta.ip, userAgent: c.meta.userAgent, data: { ccId: c.cc.id, provider } });
        }
        return json({ success: true });
      }
      default:
        return fail(404, 'Unknown action.');
    }
  } catch (err) {
    if (err instanceof AgreementError) return fail(err.status, err.message);
    console.error(`[sign/view/${action}]`, err instanceof Error ? err.message : 'error');
    return fail(500, 'Something went wrong. Please try again.');
  }
}
