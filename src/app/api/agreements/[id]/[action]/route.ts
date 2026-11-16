import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { getAgreementStore, isEnvelopeId } from '@/lib/server/agreementStore';
import { getTenantStore } from '@/lib/server/tenantStore';
import { verifyPassword } from '@/lib/server/passwords';
import { clientIp, decodeSignaturePng, fail, json, loadSettings, readJson, requireOwner, userAgentOf } from '@/lib/server/agreements/core';
import { AgreementError, retryCompletion, countersignEnvelope, linkFor, recordPayment, resendEnvelope, revokeEnvelope, sendEnvelope } from '@/lib/server/agreements/service';
import { toEnvelopeView } from '@/lib/agreements/envelope';

type Ctx = { params: Promise<{ id: string; action: string }> };

export const maxDuration = 60;

/**
 * Owner actions on one envelope (platform owner only):
 * POST /api/agreements/:id/send          freeze the PDF, issue the link, email it
 * POST /api/agreements/:id/resend        email the same link again
 * POST /api/agreements/:id/link          the link, for "Copy link"
 * POST /api/agreements/:id/complete      retry completion after a failed final-PDF build (idempotent, no new signature)
 * POST /api/agreements/:id/revoke        the link stops working
 * POST /api/agreements/:id/countersign   { password, signature?: dataUrl, useSaved?: true, saveSignature?: true }
 * POST /api/agreements/:id/pay           { date: YYYY-MM-DD, reference, amount }  billing statements: record a payment
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const { id, action } = await ctx.params;
  if (!isEnvelopeId(id)) return fail(404, 'Document not found.');
  const meta = { ip: clientIp(req), userAgent: userAgentOf(req), origin: req.nextUrl.origin };
  try {
    switch (action) {
      case 'send': {
        if (!rateLimit(`agr-send:${owner.email}`, 30, 10 * 60_000)) return fail(429, 'Too many sends in a short time. Wait a few minutes.');
        const r = await sendEnvelope(id, owner.email, meta);
        return json({ success: true, envelope: toEnvelopeView(r.envelope), url: r.url, email: r.email });
      }
      case 'resend': {
        if (!rateLimit(`agr-resend:${id}`, 5, 60 * 60_000)) return fail(429, 'This document was sent again several times this hour. Wait before sending again.');
        const r = await resendEnvelope(id, meta);
        return json({ success: true, url: r.url, email: r.email });
      }
      case 'link':
        return json({ success: true, url: await linkFor(id, meta.origin) });
      case 'complete': {
        if (!rateLimit(`agr-complete:${id}`, 6, 10 * 60_000)) return fail(429, 'Too many tries. Wait a few minutes.');
        const e = await retryCompletion(id, owner.email, meta);
        return json({ success: true, envelope: toEnvelopeView(e) });
      }
      case 'revoke': {
        const e = await revokeEnvelope(id, owner.email, meta);
        return json({ success: true, envelope: toEnvelopeView(e) });
      }
      case 'countersign': {
        if (!rateLimit(`agr-countersign:${owner.email}`, 8, 15 * 60_000)) return fail(429, 'Too many attempts. Wait 15 minutes.');
        const body = await readJson(req, 400 * 1024);
        if (!body) return fail(400, 'Send the countersignature as JSON.');
        // Owner-session re-check: confirm the password before signing for the company.
        const cred = await getTenantStore().getCredential(owner.email);
        if (!cred?.passwordHash) return fail(403, 'Set a password for your account first (Settings › Password). It is used to confirm countersignatures.');
        if (!(await verifyPassword(String(body.password || ''), cred.passwordHash))) return fail(403, 'That password is not right.');
        const { settings, savedSignature } = await loadSettings();
        let png: Buffer | null = null;
        if (body.useSaved === true) {
          png = savedSignature ? decodeSignaturePng(savedSignature) : null;
          if (!png) return fail(400, 'There is no saved signature. Draw one.');
        } else {
          png = decodeSignaturePng(body.signature);
          if (!png) return fail(400, 'Draw your signature (PNG under 200 KB).');
        }
        if (body.saveSignature === true && body.useSaved !== true) {
          const { hasSavedSignature: _h, ...rest } = settings;
          void _h;
          await getAgreementStore().putSettings({ ...rest, savedSignature: String(body.signature) }, owner.email);
        }
        const e = await countersignEnvelope(id, png, { name: settings.ownerName, title: settings.ownerTitle }, meta);
        return json({ success: true, envelope: toEnvelopeView(e) });
      }
      case 'pay': {
        const body = await readJson(req);
        if (!body) return fail(400, 'Send the payment as JSON.');
        const date = String(body.date ?? '').trim();
        const reference = String(body.reference ?? '').trim().slice(0, 120);
        const amount = Number(body.amount);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return fail(400, 'Enter the date the payment arrived.');
        if (Date.parse(date) > Date.now() + 86_400_000) return fail(400, 'The payment date cannot be in the future.');
        if (!reference) return fail(400, 'Enter the Wise reference.');
        if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return fail(400, 'Enter the amount received.');
        const r = await recordPayment(id, { date, reference, amount }, owner.email, meta);
        return json({ success: true, envelope: toEnvelopeView(r.envelope), email: r.email });
      }
      default:
        return fail(404, 'Unknown action.');
    }
  } catch (err) {
    if (err instanceof AgreementError) return fail(err.status, err.message);
    console.error(`[agreements/:id/${action}]`, err instanceof Error ? err.message : 'error');
    return fail(500, 'Something went wrong. Try again.');
  }
}
