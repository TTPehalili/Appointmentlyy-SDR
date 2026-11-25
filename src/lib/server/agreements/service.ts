/**
 * Server only. Agreements business logic: owner actions (create, send, resend, revoke, countersign),
 * signer actions (open, heartbeat, one-time codes, sign, decline), completion and notifications.
 * Route handlers authenticate (owner session or link token) and then call these.
 */
import { newId, nowIso } from '@/lib/server/tenantStore';
import { getAgreementStore, sha256Hex, type OtpPurpose } from '@/lib/server/agreementStore';
import {
  AGREEMENT_LIMITS,
  activeCopies,
  fmtManila,
  type AgreementSettings,
  type CcRecipient,
  type Envelope,
  type EnvelopeStatus,
  type SignatureKind,
} from '@/lib/agreements/envelope';
import {
  ccViewUrl,
  consoleUrl,
  newCcToken,
  unsealCcToken,
  validateCopies,
  evaluateAccess,
  findTemplate,
  hashOtp,
  loadSettings,
  metaOf,
  newOtpCode,
  newSigningToken,
  otpMatches,
  pastExpiry,
  signingUrl,
  unsealToken,
  fieldProblems,
  fileNameFor,
} from '@/lib/server/agreements/core';
import { ccMail, completedMail, inviteMail, otpMail, ownerNoticeMail, sendAgreementMail } from '@/lib/server/agreements/mail';
import { buildFinalPdf, pdfPageCount } from '@/lib/server/agreements/finalPdf';
import { EMAIL_RE } from '@/lib/roles';
import { billingFor, nextStatementNumber, numberField, stampPaid } from '@/lib/server/agreements/billing';
import { balanceOf, fmtMoney, type BillingInfo } from '@/lib/agreements/envelope';
import { welcomeEnabled } from '@/lib/agreements/welcome';
import { scheduleWelcome } from '@/lib/server/agreements/welcome';

export class AgreementError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export interface RequestMeta {
  ip: string;
  userAgent: string;
  origin?: string;
}

const store = () => getAgreementStore();
const MB5 = 5 * 1024 * 1024;

// ------------------------------------------------------------------ owner notifications

async function notifyOwner(e: Envelope, settings: AgreementSettings, subject: string, lines: string[], origin?: string) {
  const to = settings.ownerEmail || settings.senderEmail;
  if (!to) return;
  const r = await sendAgreementMail(ownerNoticeMail({ to, subject, lines, consoleUrl: consoleUrl(e.id, origin), envelopeId: e.id }), settings);
  if (!r.ok) console.warn('[agreements] owner notification not sent:', r.error);
}

/**
 * Housekeeping after an owner list: links past their expiry become `expired`, and the owner hears
 * about unsigned documents expiring within 24 hours (once per envelope). `listed` reuses the rows
 * the caller has just read instead of reading every envelope again. Every write is guarded by the
 * envelope's current status, as before.
 */
export async function sweep(origin?: string, listed?: Envelope[]): Promise<void> {
  const now = Date.now();
  const rows = listed ?? (await store().listEnvelopes());
  let settings: AgreementSettings | null = null;
  for (const e of rows) {
    if (e.status !== 'sent' && e.status !== 'opened') continue;
    if (pastExpiry(e, now)) {
      await markExpired(e);
      continue;
    }
    const exp = Date.parse(e.access.expiresAt);
    if (!e.notified.expiring && exp - now <= 86_400_000 && e.templateMeta?.action !== 'view') {
      const updated = await store().updateEnvelope(e.id, { notified: { ...e.notified, expiring: true } }, ['sent', 'opened']);
      if (!updated) continue;
      settings ??= (await loadSettings()).settings;
      await notifyOwner(e, settings, `Expiring within 24 hours, not signed: ${e.title}`, [
        `${e.recipient.name} has not signed “${e.title}” yet.`,
        `The link expires ${fmtManila(e.access.expiresAt)} (Asia/Manila). Extend it in Agreements if needed.`,
      ], origin);
    }
  }
}

/** Minimum time between two list sweeps on one server. Reads still enforce expiry themselves. */
export const SWEEP_MIN_GAP_MS = 60_000;
const sweepClock = globalThis as unknown as { __appyAgreementsLastSweep?: number };

/** True (and the clock is set) when the last list sweep on this server was over a minute ago. */
export function sweepDue(now = Date.now()): boolean {
  if (now - (sweepClock.__appyAgreementsLastSweep ?? 0) < SWEEP_MIN_GAP_MS) return false;
  sweepClock.__appyAgreementsLastSweep = now;
  return true;
}

async function markExpired(e: Envelope) {
  const updated = await store().updateEnvelope(e.id, { status: 'expired' }, ['sent', 'opened']);
  if (updated) await store().addEvent({ envelopeId: e.id, type: 'expired', data: { expiresAt: e.access.expiresAt } });
}

/** Called from public routes: an expired link is recorded as expired the first time it is seen. */
export async function expireIfDue(e: Envelope): Promise<Envelope> {
  if ((e.status === 'sent' || e.status === 'opened') && pastExpiry(e)) {
    await markExpired(e);
    return { ...e, status: 'expired' };
  }
  return e;
}

// ------------------------------------------------------------------ owner actions

export async function renderOriginal(e: Envelope): Promise<Uint8Array> {
  const t = findTemplate(e.templateId);
  if (!t) throw new AgreementError('This template is not available on the server any more.', 409);
  return t.render(e.fieldValues);
}

/**
 * Freeze and send a draft: render the PDF, store it with its SHA-256, issue a 256-bit link token
 * (only its hash and a sealed copy are stored) and email the link. Email failure leaves it sent:
 * the owner can copy the link.
 */
export interface CopyMailResult {
  sent: number;
  failed: number;
  error?: string;
}

export async function sendEnvelope(
  id: string,
  actorEmail: string,
  meta: RequestMeta,
): Promise<{ envelope: Envelope; url: string; email: { ok: boolean; error?: string; outbox?: boolean; copies?: CopyMailResult } }> {
  const e = await store().getEnvelope(id);
  if (!e) throw new AgreementError('Not found.', 404);
  if (e.status !== 'draft') throw new AgreementError('This document has already been sent.', 409);
  const t = findTemplate(e.templateId);
  if (!t) throw new AgreementError('This template is not available on the server any more.', 409);
  // Billing statements get the next sequential number, written into the document itself.
  let values = e.fieldValues;
  let billing: BillingInfo | null = null;
  if (t.action === 'view') {
    const nf = numberField(t);
    const number = await nextStatementNumber();
    if (nf) values = { ...values, [nf.key]: number };
    billing = billingFor(t, values, number, e.billing?.sourceEnvelopeId ?? null);
    if (!(billing.total > 0)) throw new AgreementError('The statement total is zero. Add the line items or the amount.');
  }
  const problem = fieldProblems(t, values);
  if (problem) throw new AgreementError(problem);
  if (!e.recipient.name) throw new AgreementError('Enter the recipient’s name.');
  if (!EMAIL_RE.test(e.recipient.email)) throw new AgreementError('Enter the recipient’s email.');
  if (Date.parse(e.access.expiresAt) <= Date.now()) throw new AgreementError('The expiry date is in the past. Pick a later date.');
  // Copies: checked again against the signer (the draft may have changed), each gets its own token.
  const copies = activeCopies(e.cc);
  const ccCheck = validateCopies(copies, e.recipient.email);
  if (!ccCheck.ok) throw new AgreementError(ccCheck.error);
  const ccTokens = new Map<string, string>();
  const cc: CcRecipient[] = copies.map((c) => {
    const k = newCcToken(e.id, c.id);
    ccTokens.set(c.id, k.token);
    return { ...c, tokenHash: k.hash, tokenSealed: k.sealed };
  });

  const pdf = await t.render(values);
  const pageCount = await pdfPageCount(pdf);
  const { sha256 } = await store().putFile(e.id, 'original', 'application/pdf', pdf);
  const tok = newSigningToken(e.id);
  const sentAt = nowIso();
  const updated = await store().updateEnvelope(
    e.id,
    {
      status: 'sent',
      title: t.title(values).slice(0, AGREEMENT_LIMITS.titleMax) || e.title,
      // The owner's welcome-email switch, set on the draft, is kept when the setup is frozen.
      templateMeta: metaOf(t, values, e.templateMeta?.welcome !== false),
      fieldValues: values,
      ...(billing ? { billing } : {}),
      originalSha256: sha256,
      pageCount,
      tokenHash: tok.hash,
      tokenSealed: tok.sealed,
      // Only written when there are copies (documents without copies are stored exactly as before).
      ...((e.cc ?? []).length ? { cc } : {}),
      sentAt,
      lastActivityAt: sentAt,
    },
    ['draft'],
  );
  if (!updated) throw new AgreementError('This document has already been sent.', 409);
  await store().addEvent({ envelopeId: e.id, type: 'sent', ip: meta.ip, userAgent: meta.userAgent, data: { by: actorEmail, originalSha256: sha256, pageCount, ...(cc.length ? { copies: cc.length } : {}) } });
  const url = signingUrl(tok.token, meta.origin);
  // The signer's email first and unchanged; then one SEPARATE email per copy, with its own link.
  const email = await emailInvite(updated, url, meta);
  const copyMail = cc.length ? await emailCopies(updated, cc.map((c) => ({ cc: c, token: ccTokens.get(c.id)! })), meta, 'send') : null;
  return { envelope: updated, url, email: copyMail ? { ...email, copies: copyMail } : email };
}

/**
 * The "for your information" email to each copy recipient: a separate email per copy, with that
 * copy's own view-only link. Never includes the signer's link, never sent to the signer's address.
 */
async function emailCopies(e: Envelope, list: { cc: CcRecipient; token: string }[], meta: RequestMeta, reason: 'send' | 'resend' | 'copies') {
  const { settings } = await loadSettings();
  let sent = 0;
  let failed = 0;
  let lastError: string | undefined;
  for (const { cc, token } of list) {
    const r = await sendAgreementMail(
      ccMail({
        to: cc.email,
        ccName: cc.name,
        signerName: e.recipient.name,
        title: e.title,
        url: ccViewUrl(token, meta.origin),
        expiresText: fmtManila(e.access.expiresAt),
        action: e.templateMeta?.action ?? 'sign',
        senderName: settings.senderName,
        envelopeId: e.id,
      }),
      settings,
    );
    if (r.ok) {
      sent++;
      await store().addEvent({ envelopeId: e.id, type: 'cc_sent', ip: meta.ip, userAgent: meta.userAgent, data: { ccId: cc.id, to: cc.email, reason } });
    } else {
      failed++;
      lastError = r.error;
      await store().addEvent({ envelopeId: e.id, type: 'cc_email_failed', data: { ccId: cc.id, to: cc.email, reason, error: r.error.slice(0, 300) } });
    }
  }
  return { sent, failed, ...(lastError ? { error: lastError } : {}) };
}

/** Live copies with a link, and their tokens (removed copies and unreadable tokens are skipped). */
function copyLinks(e: Envelope): { cc: CcRecipient; token: string }[] {
  const out: { cc: CcRecipient; token: string }[] = [];
  for (const c of activeCopies(e.cc)) {
    const token = unsealCcToken(e.id, c);
    if (token) out.push({ cc: c, token });
  }
  return out;
}

async function emailInvite(e: Envelope, url: string, meta: RequestMeta, resend = false) {
  const { settings } = await loadSettings();
  const r = await sendAgreementMail(
    inviteMail({
      to: e.recipient.email,
      recipientName: e.recipient.name,
      title: e.title,
      url,
      expiresText: fmtManila(e.access.expiresAt),
      action: e.templateMeta?.action ?? 'sign',
      senderName: settings.senderName,
      envelopeId: e.id,
    }),
    settings,
  );
  if (r.ok) {
    if (resend) await store().addEvent({ envelopeId: e.id, type: 'resent', ip: meta.ip, userAgent: meta.userAgent, data: { to: e.recipient.email } });
    return { ok: true, outbox: r.outbox };
  }
  await store().addEvent({ envelopeId: e.id, type: 'email_failed', data: { error: r.error.slice(0, 300) } });
  return { ok: false, error: r.error };
}

export async function resendEnvelope(id: string, meta: RequestMeta) {
  const e = await store().getEnvelope(id);
  if (!e) throw new AgreementError('Not found.', 404);
  if (e.status !== 'sent' && e.status !== 'opened') throw new AgreementError('Only documents waiting for the client can be sent again.', 409);
  if (pastExpiry(e)) throw new AgreementError('The link has expired. Extend the expiry first.', 409);
  const token = unsealToken(e);
  if (!token) throw new AgreementError('The link for this document is not available. Revoke it and send a new one.', 409);
  const url = signingUrl(token, meta.origin);
  const email = await emailInvite(e, url, meta, true);
  const links = copyLinks(e);
  const copies = links.length ? await emailCopies(e, links, meta, 'resend') : null;
  return { url, email: copies ? { ...email, copies } : email };
}

/** "Resend to copies": the view-only email again, to every live copy (the signer gets nothing). */
export async function resendCopies(id: string, meta: RequestMeta) {
  const e = await store().getEnvelope(id);
  if (!e) throw new AgreementError('Not found.', 404);
  if (e.status !== 'sent' && e.status !== 'opened') throw new AgreementError('Copies can be sent again only while the document is waiting for the client.', 409);
  if (pastExpiry(e)) throw new AgreementError('The link has expired. Extend the expiry first.', 409);
  const links = copyLinks(e);
  if (!links.length) throw new AgreementError('There are no copy recipients to send to.', 409);
  return { copies: await emailCopies(e, links, meta, 'copies') };
}

/**
 * Remove a copy recipient. A draft simply drops it; after sending, its view-only token is cleared
 * at once (the link stops working) and the entry is kept, marked removed, for the record.
 */
export async function removeCopy(id: string, ccId: string, actorEmail: string, meta: RequestMeta): Promise<Envelope> {
  const e = await store().getEnvelope(id);
  if (!e) throw new AgreementError('Not found.', 404);
  const target = (e.cc ?? []).find((c) => c.id === ccId);
  if (!target || target.removedAt) throw new AgreementError('That copy recipient is not on this document.', 404);
  const cc =
    e.status === 'draft'
      ? e.cc.filter((c) => c.id !== ccId)
      : e.cc.map((c) => (c.id === ccId ? { ...c, tokenHash: null, tokenSealed: null, removedAt: nowIso() } : c));
  const updated = await store().updateEnvelope(e.id, { cc }, [e.status]);
  if (!updated) throw new AgreementError('This document changed meanwhile. Reload and try again.', 409);
  await store().addEvent({ envelopeId: e.id, type: 'cc_removed', ip: meta.ip, userAgent: meta.userAgent, data: { ccId, to: target.email, by: actorEmail } });
  return updated;
}

/** A copy recipient's rendered view: its own event, never the signer's opens, time or pages. */
export async function recordCopyView(e: Envelope, cc: CcRecipient, meta: RequestMeta, visitId: string) {
  await store().addEvent({ envelopeId: e.id, type: 'cc_viewed', ip: meta.ip, userAgent: meta.userAgent, data: { ccId: cc.id, visitId } });
}

export async function linkFor(id: string, origin?: string): Promise<string> {
  const e = await store().getEnvelope(id);
  if (!e) throw new AgreementError('Not found.', 404);
  const token = unsealToken(e);
  if (!token) throw new AgreementError('This document has no link yet. Send it first.', 409);
  return signingUrl(token, origin);
}

export async function revokeEnvelope(id: string, actorEmail: string, meta: RequestMeta) {
  const updated = await store().updateEnvelope(id, { status: 'revoked', revokedAt: nowIso() }, ['sent', 'opened', 'expired', 'signed']);
  if (!updated) throw new AgreementError('Only sent documents that are not completed can be revoked.', 409);
  await store().addEvent({ envelopeId: id, type: 'revoked', ip: meta.ip, userAgent: meta.userAgent, data: { by: actorEmail } });
  return updated;
}

// ------------------------------------------------------------------ signer actions

/** A visit started: one `opened` event, opens + 1, first-open notice to the owner. */
export async function recordOpen(e: Envelope, meta: RequestMeta, visitId = ''): Promise<Envelope> {
  const now = nowIso();
  const first = !e.firstOpenedAt;
  const updated =
    (await store().updateEnvelope(
      e.id,
      {
        opens: e.opens + 1,
        status: e.status === 'sent' ? 'opened' : e.status,
        firstOpenedAt: e.firstOpenedAt ?? now,
        lastActivityAt: now,
        ...(first ? { notified: { ...e.notified, firstOpen: true } } : {}),
      },
      ['sent', 'opened'],
    )) ?? e;
  await store().addEvent({ envelopeId: e.id, type: 'opened', ip: meta.ip, userAgent: meta.userAgent, data: { visit: updated.opens, ...(visitId ? { visitId } : {}) } });
  if (first && !e.notified.firstOpen) {
    const { settings } = await loadSettings();
    await notifyOwner(e, settings, `Opened: ${e.title}`, [`${e.recipient.name} opened “${e.title}” for the first time.`, `Time: ${fmtManila(now)} (Asia/Manila).`], meta.origin);
  }
  return updated;
}

export async function recordHeartbeat(e: Envelope, raw: { seconds?: unknown; page?: unknown; pages?: unknown }, visitId = '') {
  const seconds = Math.max(0, Math.min(15, Math.round(Number(raw.seconds) || 0)));
  const maxPage = Math.max(1, e.pageCount || 1);
  const page = Math.max(0, Math.min(maxPage, Math.round(Number(raw.page) || 0)));
  const pages = Array.isArray(raw.pages)
    ? raw.pages.map((p) => Math.round(Number(p))).filter((p) => Number.isInteger(p) && p >= 1 && p <= maxPage).slice(0, 500)
    : [];
  const seen = Array.from(new Set([...e.pagesSeen, ...pages, ...(page ? [page] : [])])).sort((a, b) => a - b);
  // Per-visit numbers for the owner's view breakdown (newest 200 visits kept).
  let visitStats = e.visitStats ?? {};
  if (visitId) {
    const cur = visitStats[visitId] ?? { seconds: 0, pages: [] };
    const next = { seconds: cur.seconds + seconds, pages: Array.from(new Set([...cur.pages, ...pages, ...(page ? [page] : [])])).sort((a, b) => a - b) };
    const entries = Object.entries({ ...visitStats, [visitId]: next });
    visitStats = Object.fromEntries(entries.slice(-200));
  }
  await store().updateEnvelope(e.id, {
    visitStats,
    viewSeconds: e.viewSeconds + seconds,
    maxPage: Math.max(e.maxPage, page, ...pages, 0),
    pagesSeen: seen,
    lastActivityAt: nowIso(),
  });
}

/** Email a one-time code (6 digits, 10 minutes, 5 attempts, 60 s between sends, stored hashed). */
export async function requestOtp(e: Envelope, purpose: OtpPurpose, meta: RequestMeta): Promise<{ ok: true; outbox?: boolean } | { ok: false; error: string; retryIn?: number }> {
  const last = await store().latestOtp(e.id, purpose);
  if (last) {
    const wait = AGREEMENT_LIMITS.otpCooldownSeconds - (Date.now() - Date.parse(last.createdAt)) / 1000;
    if (wait > 0) return { ok: false, error: `Please wait ${Math.ceil(wait)} seconds before asking for another code.`, retryIn: Math.ceil(wait) };
  }
  const code = newOtpCode();
  await store().addOtp({
    envelopeId: e.id,
    purpose,
    codeHash: hashOtp(e.id, purpose, code),
    expiresAt: new Date(Date.now() + AGREEMENT_LIMITS.otpTtlMinutes * 60_000).toISOString(),
  });
  const { settings } = await loadSettings();
  const r = await sendAgreementMail(otpMail({ to: e.recipient.email, code, title: e.title, purpose, envelopeId: e.id }), settings);
  if (!r.ok) return { ok: false, error: 'We could not email your code. Please try again in a minute, or contact the sender.' };
  await store().addEvent({ envelopeId: e.id, type: 'otp_sent', ip: meta.ip, userAgent: meta.userAgent, data: { purpose } });
  return { ok: true, outbox: r.outbox };
}

/** Check a code. Wrong codes count against the 5 attempts; a right one is used up. */
export async function verifyOtp(e: Envelope, purpose: OtpPurpose, code: unknown, meta: RequestMeta): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) return { ok: false, error: 'Enter the 6-digit code from your email.' };
  const row = await store().latestOtp(e.id, purpose);
  if (!row || row.consumedAt) return { ok: false, error: 'Ask for a code first.' };
  if (Date.parse(row.expiresAt) < Date.now()) return { ok: false, error: 'That code has expired. Ask for a new one.' };
  if (row.attempts >= AGREEMENT_LIMITS.otpMaxAttempts) return { ok: false, error: 'Too many wrong codes. Ask for a new one.' };
  // Reserve the attempt atomically BEFORE comparing, so parallel guesses cannot share one count
  // (compare-and-set on the attempts value; a lost race is simply refused).
  const attempts = row.attempts + 1;
  if (!(await store().updateOtp(row.id, { attempts }, { attempts: row.attempts, unconsumed: true }))) {
    return { ok: false, error: 'Please try again in a moment.' };
  }
  if (!otpMatches(row.codeHash, hashOtp(e.id, purpose, code.trim()))) {
    await store().addEvent({ envelopeId: e.id, type: 'otp_failed', ip: meta.ip, userAgent: meta.userAgent, data: { purpose, attempts } });
    const left = AGREEMENT_LIMITS.otpMaxAttempts - attempts;
    return { ok: false, error: left > 0 ? `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. Ask for a new one.' };
  }
  // One use only: a second request with the same right code loses this compare-and-set.
  if (!(await store().updateOtp(row.id, { consumedAt: nowIso() }, { unconsumed: true }))) return { ok: false, error: 'Ask for a code first.' };
  await store().addEvent({ envelopeId: e.id, type: 'otp_verified', ip: meta.ip, userAgent: meta.userAgent, data: { purpose } });
  return { ok: true };
}

export interface SignInput {
  name: string;
  title: string;
  answers: Record<string, unknown>;
  signatureKind: SignatureKind;
  signaturePng: Buffer | null;
  outcome: 'signed' | 'confirmed' | 'concern';
  concern?: string;
}

/** Record the client's signature (or acknowledgement). Completes at once when no countersign is needed. */
export async function signEnvelope(e: Envelope, input: SignInput, meta: RequestMeta): Promise<Envelope> {
  const meta0 = e.templateMeta;
  if (!meta0 || meta0.action === 'view') throw new AgreementError('This document cannot be signed.', 409);
  const signedAt = nowIso();
  if (input.signaturePng) await store().putFile(e.id, 'signer-signature', 'image/png', input.signaturePng);
  const updated = await store().updateEnvelope(
    e.id,
    {
      status: 'signed',
      signedAt,
      lastActivityAt: signedAt,
      signerFormValues: input.answers,
      signer: {
        name: input.name,
        title: input.title,
        email: e.recipient.email,
        signatureKind: input.signatureKind,
        outcome: input.outcome,
        ...(input.concern ? { concern: input.concern } : {}),
        signedAt,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
      notified: { ...e.notified, signed: true },
    },
    ['sent', 'opened'],
  );
  if (!updated) throw new AgreementError('This document can no longer be signed.', 409);
  const type = meta0.action === 'sign' ? 'signed' : input.outcome === 'concern' ? 'concern' : 'acknowledged';
  await store().addEvent({
    envelopeId: e.id,
    type,
    ip: meta.ip,
    userAgent: meta.userAgent,
    data: { name: input.name, title: input.title, signatureKind: input.signatureKind, ...(input.concern ? { concern: input.concern.slice(0, 500) } : {}) },
  });

  const { settings } = await loadSettings();
  const verb = type === 'signed' ? 'Signed' : type === 'concern' ? 'Concern raised' : 'Confirmed';
  await notifyOwner(
    updated,
    settings,
    `${verb}: ${e.title}`,
    [
      `${input.name} (${input.title}) ${type === 'signed' ? 'signed' : type === 'concern' ? 'raised a concern on' : 'confirmed'} “${e.title}”.`,
      ...(input.concern ? [`Concern: ${input.concern}`] : []),
      ...(meta0.countersign ? ['Countersign it in Agreements to complete it.'] : []),
    ],
    meta.origin,
  );

  if (!meta0.countersign) {
    try {
      return await completeEnvelope(updated, meta);
    } catch (err) {
      // The signature is recorded; the owner can use "Retry completion".
      console.error('[agreements] completion failed after signing:', err instanceof Error ? err.message : 'error');
      return updated;
    }
  }
  return updated;
}

export async function declineEnvelope(e: Envelope, reason: string, meta: RequestMeta): Promise<Envelope> {
  const at = nowIso();
  const updated = await store().updateEnvelope(e.id, { status: 'declined', declinedAt: at, declineReason: reason, lastActivityAt: at, notified: { ...e.notified, declined: true } }, [
    'sent',
    'opened',
  ]);
  if (!updated) throw new AgreementError('This document can no longer be declined.', 409);
  await store().addEvent({ envelopeId: e.id, type: 'declined', ip: meta.ip, userAgent: meta.userAgent, data: { reason: reason.slice(0, 500) } });
  const { settings } = await loadSettings();
  await notifyOwner(updated, settings, `Declined: ${e.title}`, [`${e.recipient.name} declined “${e.title}”.`, `Reason: ${reason}`], meta.origin);
  return updated;
}

// ------------------------------------------------------------------ countersign and completion

export async function countersignEnvelope(id: string, png: Buffer, owner: { name: string; title: string }, meta: RequestMeta): Promise<Envelope> {
  const e = await store().getEnvelope(id);
  if (!e) throw new AgreementError('Not found.', 404);
  if (e.status !== 'signed') throw new AgreementError('Only documents the client has signed can be countersigned.', 409);
  if (!e.templateMeta?.countersign) throw new AgreementError('This document does not need a countersignature.', 409);
  if (e.ownerSignature) throw new AgreementError('Already countersigned. Use “Retry completion” to finish it.', 409);
  const at = nowIso();
  // Only one countersignature: the record is claimed first (compare-and-set), then the image is stored.
  const updated = await store().updateEnvelope(
    e.id,
    { ownerSignature: { name: owner.name, title: owner.title, signedAt: at, ip: meta.ip, userAgent: meta.userAgent }, lastActivityAt: at },
    ['signed'],
    { ifNoOwnerSignature: true },
  );
  if (!updated) throw new AgreementError('Already countersigned, or not ready for a countersignature.', 409);
  await store().putFile(e.id, 'owner-signature', 'image/png', png);
  await store().addEvent({ envelopeId: e.id, type: 'countersigned', ip: meta.ip, userAgent: meta.userAgent, at, data: { name: owner.name } });
  try {
    return await completeEnvelope(updated, meta);
  } catch (err) {
    console.error('[agreements] completion failed after countersigning:', err instanceof Error ? err.message : 'error');
    throw new AgreementError('Countersigned, but the final PDF could not be built. Use “Retry completion”.', 500);
  }
}

/** True when everything is signed but the final PDF was never sealed (completion failed). */
export function needsCompletion(e: Envelope): boolean {
  return e.status === 'signed' && !!e.signer && (!e.templateMeta?.countersign || !!e.ownerSignature);
}

/**
 * "Retry completion": builds and seals the final PDF for a document whose signatures are all
 * recorded. Idempotent (completed documents are refused, the status change is compare-and-set) and
 * never takes a signature.
 */
export async function retryCompletion(id: string, actorEmail: string, meta: RequestMeta): Promise<Envelope> {
  const e = await store().getEnvelope(id);
  if (!e) throw new AgreementError('Not found.', 404);
  if (e.status === 'completed') throw new AgreementError('This document is already completed.', 409);
  if (!needsCompletion(e)) throw new AgreementError('There is nothing to complete: a signature is still missing.', 409);
  const r = await completeEnvelope(e, meta);
  await store().addEvent({ envelopeId: e.id, type: 'completion_retried', ip: meta.ip, userAgent: meta.userAgent, data: { by: actorEmail } });
  return r;
}

/**
 * Append the Execution page and the Certificate with pdf-lib, store the final PDF and its SHA-256,
 * mark completed and email both parties (download link, plus the PDF attached under 5 MB).
 */
export async function completeEnvelope(e: Envelope, meta: RequestMeta): Promise<Envelope> {
  const original = await store().getFile(e.id, 'original');
  if (!original) throw new AgreementError('The original PDF is missing.', 500);
  if (sha256Hex(original.bytes) !== e.originalSha256) throw new AgreementError('The stored original PDF does not match its fingerprint. Completion stopped.', 500);
  const [events, signerSig, ownerSig] = await Promise.all([
    store().listEvents(e.id),
    store().getFile(e.id, 'signer-signature'),
    store().getFile(e.id, 'owner-signature'),
  ]);
  const completedAt = nowIso();
  const meta0 = e.templateMeta!;
  const { final, certificate } = await buildFinalPdf(original.bytes, {
    envelope: e,
    signerForm: meta0.signerForm,
    action: meta0.action,
    countersign: meta0.countersign,
    events,
    signerSignature: meta0.action === 'sign' && signerSig ? signerSig.bytes : null,
    ownerSignature: meta0.countersign && ownerSig ? ownerSig.bytes : null,
    completedAt,
  });
  const { sha256: finalSha256 } = await store().putFile(e.id, 'final', 'application/pdf', final);
  await store().putFile(e.id, 'certificate', 'application/pdf', certificate);
  const updated = await store().updateEnvelope(e.id, { status: 'completed', completedAt, finalSha256, lastActivityAt: completedAt }, ['signed']);
  if (!updated) throw new AgreementError('This document was already completed.', 409);
  await store().addEvent({ envelopeId: e.id, type: 'completed', at: completedAt, data: { finalSha256 } });

  // Email both parties. The signer's link becomes their download page.
  const { settings } = await loadSettings();
  const token = unsealToken(updated);
  const signerUrl = token ? signingUrl(token, meta.origin) : null;
  const attach = final.length < MB5 ? [{ filename: fileNameFor(updated, '-signed'), content: Buffer.from(final) }] : undefined;
  const toSigner = completedMail({ to: updated.recipient.email, name: updated.recipient.name, title: updated.title, url: signerUrl, attached: !!attach, envelopeId: e.id, finalSha256 });
  toSigner.attachments = attach;
  const ownerTo = settings.ownerEmail || settings.senderEmail;
  const toOwner = completedMail({ to: ownerTo, name: settings.ownerName, title: updated.title, url: consoleUrl(e.id, meta.origin), attached: !!attach, envelopeId: e.id, finalSha256 });
  toOwner.attachments = attach;
  const [a, b] = await Promise.all([sendAgreementMail(toSigner, settings), sendAgreementMail(toOwner, settings)]);
  await store().addEvent({
    envelopeId: e.id,
    type: 'final_emailed',
    data: { signer: a.ok ? 'sent' : a.error.slice(0, 200), owner: b.ok ? 'sent' : b.error.slice(0, 200), attached: !!attach },
  });
  // Copies: the same completed copy, each in its own email, the download link being their own page.
  for (const { cc, token } of copyLinks(updated)) {
    const m = completedMail({ to: cc.email, name: cc.name, title: updated.title, url: ccViewUrl(token, meta.origin), attached: !!attach, envelopeId: e.id, finalSha256 });
    m.kind = 'cc_completed';
    m.attachments = attach;
    const r = await sendAgreementMail(m, settings);
    await store().addEvent({ envelopeId: e.id, type: 'cc_final_emailed', data: { ccId: cc.id, to: cc.email, ok: r.ok, ...(r.ok ? {} : { error: r.error.slice(0, 200) }) } });
  }
  // Fully executed contract: the welcome / kickoff email, once, after this response (never fails the completion).
  if (welcomeEnabled(updated)) scheduleWelcome(updated.id, meta.origin);
  return updated;
}

// ------------------------------------------------------------------ create / update

export function newEnvelopeRecord(input: {
  templateId: string;
  title: string;
  fieldValues: Record<string, string>;
  recipient: Envelope['recipient'];
  cc?: CcRecipient[];
  access: Envelope['access'];
  templateMeta: Envelope['templateMeta'];
  createdBy: string;
}): Envelope {
  const now = nowIso();
  return {
    id: newId(),
    templateId: input.templateId,
    templateMeta: input.templateMeta,
    title: input.title,
    fieldValues: input.fieldValues,
    recipient: input.recipient,
    cc: input.cc ?? [],
    access: input.access,
    status: 'draft',
    originalSha256: null,
    finalSha256: null,
    pageCount: 0,
    tokenHash: null,
    tokenSealed: null,
    opens: 0,
    viewSeconds: 0,
    maxPage: 0,
    pagesSeen: [],
    signerFormValues: null,
    signer: null,
    ownerSignature: null,
    declineReason: null,
    billing: null,
    visitStats: {},
    notified: {},
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
    sentAt: null,
    firstOpenedAt: null,
    lastActivityAt: now,
    signedAt: null,
    completedAt: null,
    declinedAt: null,
    revokedAt: null,
  };
}

/** Access rules changed while unsigned. An expired link with a new future expiry works again. */
export async function changeAccess(e: Envelope, access: Envelope['access'], actorEmail: string, meta: RequestMeta): Promise<Envelope> {
  let status: EnvelopeStatus = e.status;
  if (e.status === 'expired' && !pastExpiry({ ...e, access })) status = e.firstOpenedAt ? 'opened' : 'sent';
  const updated = await store().updateEnvelope(
    e.id,
    { access, status, notified: { ...e.notified, expiring: Date.parse(access.expiresAt) - Date.now() <= 86_400_000 ? e.notified.expiring : false } },
    ['sent', 'opened', 'expired'],
  );
  if (!updated) throw new AgreementError('Link rules can only change before the client signs.', 409);
  await store().addEvent({ envelopeId: e.id, type: 'access_changed', ip: meta.ip, userAgent: meta.userAgent, data: { by: actorEmail, ...access } });
  return updated;
}

export { evaluateAccess };

// ------------------------------------------------------------------ billing statements

/**
 * Record a payment (date, Wise reference, amount; part payments allowed). Emails the client a
 * "Payment received" copy stamped PAID (or PART PAID with the balance). Fully paid statements are
 * completed, with the stamped copy as the final file.
 */
export async function recordPayment(
  id: string,
  input: { date: string; reference: string; amount: number },
  actorEmail: string,
  meta: RequestMeta,
): Promise<{ envelope: Envelope; email: { ok: boolean; error?: string } }> {
  const e = await store().getEnvelope(id);
  if (!e) throw new AgreementError('Not found.', 404);
  if (e.templateMeta?.action !== 'view' || !e.billing || !e.billing.number) throw new AgreementError('Only sent billing statements can be marked as paid.', 409);
  if (!['sent', 'opened', 'expired', 'completed'].includes(e.status)) throw new AgreementError('This statement can no longer take payments.', 409);
  const balance = balanceOf(e.billing);
  if (balance <= 0) throw new AgreementError('This statement is already paid in full.', 409);
  if (input.amount > balance + 0.005) throw new AgreementError(`That is more than the balance (${fmtMoney(balance, e.billing.currency)}).`);
  const at = nowIso();
  const billing: BillingInfo = { ...e.billing, payments: [...e.billing.payments, { date: input.date, reference: input.reference, amount: Math.round(input.amount * 100) / 100, recordedAt: at, by: actorEmail }] };
  const full = balanceOf(billing) <= 0;
  const original = await store().getFile(e.id, 'original');
  if (!original) throw new AgreementError('The original PDF is missing.', 500);
  const stamped = await stampPaid(original.bytes, { ...e, billing });
  let finalSha256 = e.finalSha256;
  if (full) finalSha256 = (await store().putFile(e.id, 'final', 'application/pdf', stamped)).sha256;
  const updated = await store().updateEnvelope(
    e.id,
    { billing, lastActivityAt: at, ...(full ? { status: 'completed' as const, completedAt: at, finalSha256 } : {}) },
    ['sent', 'opened', 'expired', 'completed'],
  );
  if (!updated) throw new AgreementError('This statement changed meanwhile. Reload and try again.', 409);
  await store().addEvent({ envelopeId: e.id, type: 'payment_recorded', ip: meta.ip, userAgent: meta.userAgent, data: { date: input.date, reference: input.reference, amount: input.amount, by: actorEmail, full } });

  const { settings } = await loadSettings();
  const b = billing;
  const first = e.recipient.name.split(' ')[0] || 'there';
  const lines = [
    `Hi ${first},`,
    `Thank you: we received ${fmtMoney(input.amount, b.currency)} on ${input.date} for billing statement ${b.number} (Wise reference ${input.reference}).`,
    full ? 'The statement is now paid in full. A copy stamped PAID is attached.' : `The remaining balance is ${fmtMoney(balanceOf(b), b.currency)}. A copy showing the payment is attached.`,
  ];
  const r = await sendAgreementMail(
    {
      kind: 'payment',
      envelopeId: e.id,
      to: e.recipient.email,
      subject: `Payment received, thank you: ${b.number}`,
      html: `<!doctype html><html><body style="font-family:Inter,Segoe UI,Arial,sans-serif;color:#1f2937;padding:24px">${lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`).join('')}</body></html>`,
      text: lines.join('\n\n'),
      attachments: stamped.length < MB5 ? [{ filename: fileNameFor(updated, full ? '-PAID' : '-part-paid'), content: Buffer.from(stamped) }] : undefined,
    },
    settings,
  );
  await store().addEvent({ envelopeId: e.id, type: 'payment_emailed', data: { ok: r.ok, ...(r.ok ? {} : { error: r.error.slice(0, 200) }) } });
  return { envelope: updated, email: r.ok ? { ok: true } : { ok: false, error: r.error } };
}
