import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { getAgreementStore } from '@/lib/server/agreementStore';
import {
  checkViewGrant,
  checkVisit,
  decodeSignaturePng,
  evaluateAccess,
  fail,
  fileNameFor,
  issueViewGrant,
  issueVisit,
  json,
  opensExhausted,
  PRIVATE_HEADERS,
  pdfResponse,
  readJson,
  validateSignerAnswers,
} from '@/lib/server/agreements/core';
import { loadByToken } from '@/lib/server/agreements/publicApi';
import { qrBytes, safePaymentLink } from '@/lib/server/agreements/payment';
import { safePaypalLink } from '@/lib/agreements/paymentOptions';
import { AgreementError, declineEnvelope, recordHeartbeat, recordOpen, requestOtp, signEnvelope, verifyOtp } from '@/lib/server/agreements/service';
import { AGREEMENT_LIMITS } from '@/lib/agreements/envelope';

type Ctx = { params: Promise<{ token: string; action: string }> };

export const maxDuration = 60;

const closed = (reason: string) => fail(403, 'This link has expired or is no longer available.', { state: 'closed', reason });

/**
 * Public signer actions (the link token is the credential; every request re-checks the access rules).
 * GET  pdf        the frozen document, during a visit (header x-agr-visit)
 * GET  download   the final signed PDF, after completion, while the download window lasts
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { token, action } = await ctx.params;
  const c = await loadByToken(req, token);
  if (c instanceof NextResponse) return c;
  const e = c.envelope;
  const access = evaluateAccess(e);
  const store = getAgreementStore();
  if (action === 'pdf') {
    if (access.kind !== 'open') return closed(access.kind === 'closed' ? access.reason : access.kind);
    if (!checkVisit(e.id, req.headers.get('x-agr-visit'))) return fail(403, 'Open the link again to view the document.', { state: 'reopen' });
    const file = await store.getFile(e.id, 'original');
    if (!file) return fail(404, 'The document is not available.');
    return pdfResponse(file.bytes, fileNameFor(e, ''));
  }
  // While the link is open, files need a live visit (so max opens and the view code apply to them too).
  // The visit comes in the x-agr-visit header, or ?visit= for plain links and <img> (short-lived, HMAC'd).
  const visitOk = () => Boolean(checkVisit(e.id, req.headers.get('x-agr-visit') || req.nextUrl.searchParams.get('visit')));
  if (action === 'qr') {
    // Billing statements: the payment QR as a same-origin image (CSP-friendly), while the link is open.
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
    // Billing statements ('view') can be downloaded as soon as they are open.
    if (access.kind === 'open' && e.templateMeta?.action === 'view') {
      if (!visitOk()) return fail(403, 'Open the link again to download the document.', { state: 'reopen' });
      const file = await store.getFile(e.id, 'original');
      if (!file) return fail(404, 'The document is not available.');
      return pdfResponse(file.bytes, fileNameFor(e, ''));
    }
    if (access.kind !== 'completed') return closed(access.kind === 'closed' ? access.reason : access.kind);
    const file = await store.getFile(e.id, 'final');
    if (!file) return fail(404, 'The signed document is not available.');
    if (rateLimit(`agr-dl-log:${e.id}:${c.meta.ip}`, 1, 10 * 60_000)) {
      await store.addEvent({ envelopeId: e.id, type: 'downloaded', ip: c.meta.ip, userAgent: c.meta.userAgent, data: {} });
    }
    return pdfResponse(file.bytes, fileNameFor(e, '-signed'));
  }
  return fail(404, 'Unknown action.');
}

/**
 * POST open        { grant? }                -> { visit }   starts a visit; NOT counted as an open
 * POST viewed      { visit }                               the PDF rendered in a visible tab: one "opened" event per visit
 * POST heartbeat   { visit, seconds, page, pages }          time on page, pages seen (every 10 s while visible)
 * POST paylink     { provider?: 'wise'|'paypal' }           billing statements: a payment link was clicked (tracked)
 * POST otp         { purpose: 'view'|'sign', visit? }       email a 6-digit code
 * POST verify      { code }                  -> { grant }   view code (when the owner requires one to open)
 * POST sign        { visit, name, title, authorised, consent, otp, answers, signature?, outcome?, concern? }
 * POST decline     { visit, reason }
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { token, action } = await ctx.params;
  const c = await loadByToken(req, token);
  if (c instanceof NextResponse) return c;
  const e = c.envelope;
  const body = await readJson(req, 400 * 1024);
  if (!body) return fail(400, 'Bad request.');
  const access = evaluateAccess(e);
  if (access.kind !== 'open') return closed(access.kind === 'closed' ? access.reason : access.kind);
  const visit = checkVisit(e.id, body.visit);

  try {
    switch (action) {
      case 'open': {
        if (visit) return json({ success: true, visit: body.visit });
        if (opensExhausted(e)) return closed('limit');
        if (e.access.requireOtpToView && !checkViewGrant(e.id, body.grant)) return fail(403, 'Enter the code from your email to open this document.', { state: 'otp_view' });
        // A visit is not an open: link scanners (Safe Links, mail previews) must not count or burn max opens.
        // The open is recorded by 'viewed', after the PDF has rendered in a visible tab.
        if (!rateLimit(`agr-visit-new:${e.id}`, 20, 60 * 60_000)) return fail(429, 'Too many requests. Wait a few minutes and try again.');
        return json({ success: true, visit: issueVisit(e.id) });
      }
      case 'viewed': {
        if (!visit) return fail(403, 'Open the link again.', { state: 'reopen' });
        // Once per visit.
        if (!rateLimit(`agr-viewed:${e.id}:${visit}`, 1, 4 * 3600_000)) return json({ success: true, counted: false });
        await recordOpen(e, c.meta, visit);
        return json({ success: true, counted: true });
      }
      case 'paylink': {
        // { provider: 'wise' | 'paypal' } (default 'wise', the "Pay now" link). Only a link the statement has.
        const provider = body.provider === undefined || body.provider === 'wise' ? 'wise' : body.provider === 'paypal' ? 'paypal' : null;
        if (!provider) return fail(400, 'Bad request.');
        const has = provider === 'paypal' ? safePaypalLink(e.fieldValues.paypalLink) : safePaymentLink(e.fieldValues.paymentLink);
        if (e.templateMeta?.action !== 'view' || !has) return fail(404, 'No payment link.');
        if (rateLimit(`agr-pay-click:${e.id}:${provider}:${c.meta.ip}`, 5, 10 * 60_000)) {
          await getAgreementStore().addEvent({ envelopeId: e.id, type: 'pay_link_clicked', ip: c.meta.ip, userAgent: c.meta.userAgent, data: { provider } });
        }
        return json({ success: true });
      }
      case 'heartbeat': {
        if (!visit) return fail(403, 'Open the link again.', { state: 'reopen' });
        if (!rateLimit(`agr-hb:${e.id}:${visit}`, 12, 60_000)) return json({ success: true, throttled: true });
        await recordHeartbeat(e, body, visit);
        return json({ success: true });
      }
      case 'otp': {
        const purpose = body.purpose === 'view' ? 'view' : body.purpose === 'sign' ? 'sign' : null;
        if (!purpose) return fail(400, 'Bad request.');
        if (purpose === 'view' && !e.access.requireOtpToView) return fail(400, 'No code is needed to open this document.');
        if (purpose === 'sign' && !visit) return fail(403, 'Open the link again.', { state: 'reopen' });
        if (!rateLimit(`agr-otp-send:${e.id}`, 6, 30 * 60_000) || !rateLimit(`agr-otp-send-ip:${c.meta.ip}`, 12, 30 * 60_000)) {
          return fail(429, 'Too many codes requested. Wait 30 minutes or contact the sender.');
        }
        const r = await requestOtp(e, purpose, c.meta);
        if (!r.ok) return fail(r.retryIn ? 429 : 502, r.error, r.retryIn ? { retryIn: r.retryIn } : {});
        return json({ success: true, sentTo: 'email', cooldown: AGREEMENT_LIMITS.otpCooldownSeconds });
      }
      case 'verify': {
        if (!e.access.requireOtpToView) return fail(400, 'No code is needed to open this document.');
        if (!rateLimit(`agr-otp-try-ip:${c.meta.ip}`, 20, 15 * 60_000) || !rateLimit(`agr-otp-try-env:${e.id}`, 20, 15 * 60_000)) return fail(429, 'Too many tries. Wait 15 minutes.');
        const r = await verifyOtp(e, 'view', body.code, c.meta);
        if (!r.ok) return fail(400, r.error);
        return json({ success: true, grant: issueViewGrant(e.id) });
      }
      case 'sign': {
        if (!visit) return fail(403, 'Open the link again.', { state: 'reopen' });
        const meta = e.templateMeta;
        if (!meta || meta.action === 'view') return fail(409, 'This document cannot be signed.');
        const name = String(body.name ?? '').trim().replace(/\s+/g, ' ').slice(0, AGREEMENT_LIMITS.nameMax);
        const title = String(body.title ?? '').trim().replace(/\s+/g, ' ').slice(0, AGREEMENT_LIMITS.nameMax);
        if (name.length < 2) return fail(400, 'Type your full name.');
        if (!title) return fail(400, 'Type your job title.');
        if (body.authorised !== true) return fail(400, 'Please confirm you are authorised to sign for your company.');
        if (body.consent !== true) return fail(400, 'Please agree to sign electronically.');
        const answers = validateSignerAnswers(meta.signerForm, body.answers);
        if (!answers.ok) return fail(400, answers.error);
        let outcome: 'signed' | 'confirmed' | 'concern' = 'signed';
        let concern: string | undefined;
        let signatureKind: 'drawn' | 'typed' | 'none' = 'none';
        let png: Buffer | null = null;
        if (meta.action === 'sign') {
          signatureKind = body.signatureKind === 'typed' ? 'typed' : 'drawn';
          png = decodeSignaturePng(body.signature);
          if (!png) return fail(400, 'Add your signature (draw it, or type it).');
        } else {
          outcome = body.outcome === 'concern' ? 'concern' : 'confirmed';
          if (outcome === 'concern') {
            concern = String(body.concern ?? '').trim().slice(0, AGREEMENT_LIMITS.reasonMax);
            if (concern.length < 3) return fail(400, 'Describe your concern.');
          }
        }
        if (!rateLimit(`agr-otp-try-ip:${c.meta.ip}`, 20, 15 * 60_000) || !rateLimit(`agr-otp-try-env:${e.id}`, 20, 15 * 60_000)) return fail(429, 'Too many tries. Wait 15 minutes.');
        // The one-time code is checked last, so a form mistake does not use it up.
        const otp = await verifyOtp(e, 'sign', body.otp, c.meta);
        if (!otp.ok) return fail(400, otp.error, { field: 'otp' });
        const updated = await signEnvelope(e, { name, title, answers: answers.value, signatureKind, signaturePng: png, outcome, concern }, c.meta);
        return json({ success: true, state: updated.status === 'completed' ? 'completed' : 'signed' });
      }
      case 'decline': {
        if (e.templateMeta?.action === 'view') return fail(409, 'This document cannot be declined.');
        if (!visit) return fail(403, 'Open the link again.', { state: 'reopen' });
        const reason = String(body.reason ?? '').trim().slice(0, AGREEMENT_LIMITS.reasonMax);
        if (reason.length < 3) return fail(400, 'Tell us briefly why you are declining.');
        await declineEnvelope(e, reason, c.meta);
        return json({ success: true, state: 'declined' });
      }
      default:
        return fail(404, 'Unknown action.');
    }
  } catch (err) {
    if (err instanceof AgreementError) return fail(err.status, err.message);
    console.error(`[sign/${action}]`, err instanceof Error ? err.message : 'error');
    return fail(500, 'Something went wrong. Please try again.');
  }
}
