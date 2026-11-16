import { NextRequest, NextResponse } from 'next/server';
import { getAgreementStore } from '@/lib/server/agreementStore';
import { decodeSignaturePng, fail, json, loadSettings, readJson, requireOwner, validateSettings } from '@/lib/server/agreements/core';
import { mailStatus } from '@/lib/server/agreements/mail';

/**
 * Agreements settings (platform owner only): notification address, the owner's name and title for
 * the Execution page, the sender identity for every agreement email, and the saved countersignature.
 * GET /api/agreements/settings
 * PUT /api/agreements/settings { ownerEmail, ownerName, ownerTitle, senderName, senderEmail, replyTo, savedSignature?: dataUrl | null,
 *   billing statement defaults: paymentLink (Wise), bankName, bankAccountName, bankAccountNumber, bankSwift, bankBranch,
 *   bankCurrency, paypalLink, paypalFeeNote, paymentQr, paymentInstructions (note) }
 */
export async function GET(req: NextRequest) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const { settings, savedSignature } = await loadSettings();
  return json({ success: true, settings, savedSignature, mail: mailStatus() });
}

export async function PUT(req: NextRequest) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const body = await readJson(req, 2 * 1024 * 1024);
  if (!body) return fail(400, 'Send the settings as JSON.');
  const v = validateSettings(body);
  if (!v.ok) return fail(400, v.error);
  const current = await loadSettings();
  let savedSignature = current.savedSignature;
  if ('savedSignature' in body) {
    if (body.savedSignature === null || body.savedSignature === '') savedSignature = null;
    else if (decodeSignaturePng(body.savedSignature)) savedSignature = String(body.savedSignature);
    else return fail(400, 'The signature must be a PNG image under 200 KB.');
  }
  try {
    await getAgreementStore().putSettings({ ...v.value, savedSignature }, owner.email);
    const { settings } = await loadSettings();
    return json({ success: true, settings });
  } catch (err) {
    // Message only: a database error could echo the row (bank details are sensitive, never logged).
    console.error('[agreements/settings PUT]', err instanceof Error ? err.message.slice(0, 200) : 'error');
    return fail(500, 'Could not save the settings.');
  }
}
