import { isStatementEnvelope } from '@/lib/agreements/envelope';
import { NextRequest, NextResponse } from 'next/server';
import { checkCcVisit, clientNameOf, evaluateAccess, json, loadSettings } from '@/lib/server/agreements/core';
import { loadByCcToken } from '@/lib/server/agreements/publicApi';
import { copyOpensExhausted } from '@/lib/server/agreements/copyAccess';
import { qrBytes, safePaymentLink } from '@/lib/server/agreements/payment';
import { PAYMENT_LIMITS, bankRows, oneLine, safePaypalLink } from '@/lib/agreements/paymentOptions';

type Ctx = { params: Promise<{ token: string }> };

/**
 * GET /api/sign/view/:token   (public; a COPY recipient's view-only link token is the credential)
 * Where the copy stands: open (view only), not open yet, signed (waiting for the countersignature),
 * completed (download), or closed. Same expiry and status rules as the signer's link; the copy's
 * opens are its own. Never returns the signer's link, email or anything to sign with.
 * Header x-agr-visit: the copy's current visit, if any.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const c = await loadByCcToken(req, token);
  if (c instanceof NextResponse) return c;
  const e = c.envelope;
  const { settings } = await loadSettings();
  const contact = settings.senderName;
  const access = evaluateAccess(e);
  const signerName = e.recipient.name;
  const action = e.templateMeta?.action ?? 'sign';
  switch (access.kind) {
    case 'closed':
      return json({ success: true, viewOnly: true, state: 'closed', reason: access.reason, contact });
    case 'not_yet':
      return json({ success: true, viewOnly: true, state: 'not_yet', openFrom: access.openFrom, contact });
    case 'signed':
      return json({ success: true, viewOnly: true, state: 'signed', title: e.title, signerName, countersign: Boolean(e.templateMeta?.countersign), contact });
    case 'completed':
      return json({ success: true, viewOnly: true, state: 'completed', title: e.title, signerName, action, finalSha256: e.finalSha256, downloadUntil: access.downloadUntil, contact });
  }
  const visitValid = Boolean(checkCcVisit(e.id, c.cc.id, req.headers.get('x-agr-visit')));
  if (!visitValid && (await copyOpensExhausted(e, c.cc.id))) return json({ success: true, viewOnly: true, state: 'closed', reason: 'limit', contact });
  return json({
    success: true,
    viewOnly: true,
    state: 'open',
    visitValid,
    contact,
    doc: {
      title: e.title,
      action,
      signerName,
      clientName: clientNameOf(e),
      copyName: c.cc.name,
      pageCount: e.pageCount,
      expiresAt: e.access.expiresAt,
      // Billing statements: the same payment panel as the recipient's page (bank details only during a visit).
      ...(action === 'view'
        ? {
            // false for a custom proposal (view only, no payment panel).
            statement: isStatementEnvelope(e),
            payLink: safePaymentLink(e.fieldValues.paymentLink) ?? null,
            hasQr: Boolean(qrBytes(e.fieldValues.paymentQr)),
            paypalLink: safePaypalLink(e.fieldValues.paypalLink) ?? null,
            paypalFeeNote: safePaypalLink(e.fieldValues.paypalLink) ? oneLine(e.fieldValues.paypalFeeNote, PAYMENT_LIMITS.paypalFeeNote) || null : null,
            bank: visitValid ? bankRows(e.fieldValues).map(({ key, label, value }) => ({ key, label, value })) : [],
            payNote: visitValid ? String(e.fieldValues.paymentInstructions ?? '').trim().slice(0, 2000) || null : null,
          }
        : {}),
    },
  });
}
