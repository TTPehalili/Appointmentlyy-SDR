import { isStatementEnvelope } from '@/lib/agreements/envelope';
import { NextRequest, NextResponse } from 'next/server';
import { checkVisit, clientNameOf, evaluateAccess, json, loadSettings, maskEmail, opensExhausted } from '@/lib/server/agreements/core';
import { loadByToken } from '@/lib/server/agreements/publicApi';
import { qrBytes, safePaymentLink } from '@/lib/server/agreements/payment';
import { PAYMENT_LIMITS, bankRows, oneLine, safePaypalLink } from '@/lib/agreements/paymentOptions';

type Ctx = { params: Promise<{ token: string }> };

/**
 * GET /api/sign/:token   (public; the link token is the credential)
 * Where the signer stands: open (with the document's signing setup), waiting for a view code,
 * not open yet, signed (waiting for countersignature), completed (download), or closed.
 * Header x-agr-visit: the current visit, if any. Does not count as an open.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const c = await loadByToken(req, token);
  if (c instanceof NextResponse) return c;
  const e = c.envelope;
  const { settings } = await loadSettings();
  const contact = settings.senderName;
  const access = evaluateAccess(e);
  switch (access.kind) {
    case 'closed':
      return json({ success: true, state: 'closed', reason: access.reason, contact });
    case 'not_yet':
      return json({ success: true, state: 'not_yet', openFrom: access.openFrom, contact });
    case 'signed':
      return json({ success: true, state: 'signed', title: e.title, countersign: Boolean(e.templateMeta?.countersign), contact });
    case 'completed':
      return json({ success: true, state: 'completed', title: e.title, action: e.templateMeta?.action ?? 'sign', finalSha256: e.finalSha256, downloadUntil: access.downloadUntil, contact });
  }
  const visitValid = Boolean(checkVisit(e.id, req.headers.get('x-agr-visit')));
  if (!visitValid && opensExhausted(e)) return json({ success: true, state: 'closed', reason: 'limit', contact });
  const meta = e.templateMeta;
  return json({
    success: true,
    state: 'open',
    visitValid,
    needOtpToView: e.access.requireOtpToView && !visitValid,
    contact,
    doc: {
      title: e.title,
      emailMasked: maskEmail(e.recipient.email),
      ...(e.access.requireOtpToView && !visitValid
        ? {}
        : {
            action: meta?.action ?? 'sign',
            countersign: Boolean(meta?.countersign),
            signerForm: meta?.signerForm ?? [],
            recipientName: e.recipient.name,
            recipientTitle: e.recipient.title,
            clientName: clientNameOf(e),
            pageCount: e.pageCount,
            expiresAt: e.access.expiresAt,
            ...(meta?.action === 'view'
              ? {
                  // false for a custom proposal (view only, no payment panel).
                  statement: isStatementEnvelope(e),
                  payLink: safePaymentLink(e.fieldValues.paymentLink) ?? null,
                  hasQr: Boolean(qrBytes(e.fieldValues.paymentQr)),
                  paypalLink: safePaypalLink(e.fieldValues.paypalLink) ?? null,
                  paypalFeeNote: safePaypalLink(e.fieldValues.paypalLink) ? oneLine(e.fieldValues.paypalFeeNote, PAYMENT_LIMITS.paypalFeeNote) || null : null,
                  // Bank details and the note are sensitive: only during a live visit (like the PDF itself).
                  bank: visitValid ? bankRows(e.fieldValues).map(({ key, label, value }) => ({ key, label, value })) : [],
                  payNote: visitValid ? String(e.fieldValues.paymentInstructions ?? '').trim().slice(0, 2000) || null : null,
                }
              : {}),
          }),
    },
  });
}
