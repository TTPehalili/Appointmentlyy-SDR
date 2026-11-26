/**
 * Server only. Shared building blocks for Agreements: templates, settings, tokens, signed visit
 * grants, access-rule evaluation, request helpers and input validation.
 */
import crypto from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { listTemplates, getTemplate } from '@/lib/agreements/templates/all';
import type { AgreementTemplate, SignerFormField } from '@/lib/agreements/templates/types';
import '@/lib/server/agreements/devTemplate';
import { PLATFORM_TENANT_CODE, EMAIL_RE } from '@/lib/roles';
import { getServerSession, type ServerSession } from '@/lib/server/session';
import { getAgreementStore, sha256Hex, type StoredAgreementSettings } from '@/lib/server/agreementStore';
import { seal, open } from '@/lib/server/secretBox';
import { getAppBaseUrl } from '@/lib/authToken';
import { isPaymentLinkKey, isPaymentQrKey, safePaymentLink, safeQrDataUrl } from '@/lib/server/agreements/payment';
import { BANK_KEYS, PAYMENT_LIMITS, cleanBank, hasBank, oneLine, paymentOptionsProblem } from '@/lib/agreements/paymentOptions';
import { DEFAULT_WELCOME_BODY, DEFAULT_WELCOME_SUBJECT, isWelcomeOptIn, isWelcomeTemplate, safeBookingLink, welcomeTemplateProblem } from '@/lib/agreements/welcome';
import {
  AGREEMENT_LIMITS,
  CC_LIMITS,
  DEFAULT_AGREEMENT_SETTINGS,
  type AccessRules,
  type AgreementSettings,
  type CcRecipient,
  type Envelope,
  type TemplateMeta,
} from '@/lib/agreements/envelope';

// ------------------------------------------------------------------ templates

export function allTemplates(): AgreementTemplate[] {
  return listTemplates();
}

export function findTemplate(id: string): AgreementTemplate | undefined {
  return getTemplate(id);
}

/** Templates may vary their signer form with the owner's values (`signerFormFor`); else the static one. */
export function signerFormOf(t: AgreementTemplate, values: Record<string, string>): SignerFormField[] {
  const fn = (t as AgreementTemplate & { signerFormFor?: (v: Record<string, string>) => SignerFormField[] }).signerFormFor;
  return typeof fn === 'function' ? fn(values) : t.signerForm;
}

/**
 * The frozen signing setup. Contract templates also carry the owner's "Send welcome email when fully signed"
 * switch (`welcome`, default on); every other template never has it, so it can never send one.
 */
export function metaOf(t: AgreementTemplate, values: Record<string, string>, welcome?: boolean): TemplateMeta {
  // Custom proposals v2: signable (default) or view-only, chosen per document.
  const own = (t as TemplateHooks).actionFor;
  const { action, countersign } = typeof own === 'function' ? own(values) : { action: t.action, countersign: t.countersign };
  const m: TemplateMeta = { name: t.name, action, countersign, signerForm: signerFormOf(t, values) };
  // Contracts: on unless switched off. Signable proposals: OFF unless the owner ticked the box for this send.
  if (isWelcomeTemplate(t.id) && action === 'sign') m.welcome = isWelcomeOptIn(t.id) ? welcome === true : welcome !== false;
  return m;
}

/** The owner's welcome-email choice from a request body: true / false, or undefined (= the template's default). */
export function welcomeChoice(body: Record<string, unknown>, current?: boolean): boolean | undefined {
  if (!('welcomeEmail' in body)) return current;
  return body.welcomeEmail === false ? false : body.welcomeEmail === true ? true : undefined;
}

/** What the owner console needs to know about a template (no render function). */
export function templateSummary(t: AgreementTemplate) {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    action: t.action,
    countersign: t.countersign,
    fields: t.fields,
    signerForm: t.signerForm,
  };
}

/** The client's company name for "I am authorised to sign for ...", from the usual field keys. */
export function clientNameOf(e: Pick<Envelope, 'fieldValues'>): string {
  const v = e.fieldValues || {};
  for (const k of ['clientLegal', 'clientName', 'billToName', 'clientShort', 'client_name', 'clientCompany', 'client', 'company', 'companyName', 'clientLegalName']) {
    if (typeof v[k] === 'string' && v[k].trim()) return v[k].trim();
  }
  return '';
}

// ------------------------------------------------------------------ settings

export async function loadSettings(): Promise<{ settings: AgreementSettings; savedSignature: string | null }> {
  const stored = await getAgreementStore().getSettings();
  const { savedSignature, ...rest } = (stored ?? {}) as StoredAgreementSettings;
  const settings: AgreementSettings = { ...DEFAULT_AGREEMENT_SETTINGS, ...rest, hasSavedSignature: Boolean(savedSignature) };
  return { settings, savedSignature: savedSignature ?? null };
}

export function validateSettings(raw: Record<string, unknown>): { ok: true; value: Omit<AgreementSettings, 'hasSavedSignature'> } | { ok: false; error: string } {
  const s = (k: string, max: number) => String(raw[k] ?? '').trim().slice(0, max);
  const value = {
    ownerEmail: s('ownerEmail', 254).toLowerCase(),
    ownerName: s('ownerName', 120),
    ownerTitle: s('ownerTitle', 120),
    senderName: s('senderName', 80).replace(/[<>"\\,;:\r\n]/g, ''),
    senderEmail: s('senderEmail', 254).toLowerCase(),
    replyTo: s('replyTo', 254).toLowerCase(),
    paymentInstructions: String(raw.paymentInstructions ?? '').replace(/\r\n/g, '\n').trim().slice(0, 2000),
    paymentLink: String(raw.paymentLink ?? '').trim(),
    paymentQr: String(raw.paymentQr ?? ''),
    ...cleanBank(raw),
    paypalLink: String(raw.paypalLink ?? '').trim(),
    paypalFeeNote: oneLine(raw.paypalFeeNote, PAYMENT_LIMITS.paypalFeeNote),
    kickoffBookingLink: String(raw.kickoffBookingLink ?? '').trim(),
    // The default wording is stored as '' so later improvements to it reach owners who never changed it.
    welcomeSubject: normTemplate(raw.welcomeSubject, DEFAULT_WELCOME_SUBJECT),
    welcomeBody: normTemplate(raw.welcomeBody, DEFAULT_WELCOME_BODY),
  };
  if (value.kickoffBookingLink && !safeBookingLink(value.kickoffBookingLink)) return { ok: false, error: 'The kickoff booking link must be a full https:// address (a Google Calendar booking page or Calendly).' };
  const subjectProblem = welcomeTemplateProblem('subject', value.welcomeSubject);
  if (subjectProblem) return { ok: false, error: subjectProblem };
  const bodyProblem = welcomeTemplateProblem('body', value.welcomeBody);
  if (bodyProblem) return { ok: false, error: bodyProblem };
  if (value.paymentLink && !safePaymentLink(value.paymentLink)) return { ok: false, error: 'The payment link must be a full https:// address.' };
  // Bank transfer + PayPal: checked on the raw input so over-long values are refused, not cut.
  const payProblem = paymentOptionsProblem(raw);
  if (payProblem) return { ok: false, error: payProblem };
  if (value.paymentQr) {
    const qr = safeQrDataUrl(value.paymentQr);
    if (!qr) return { ok: false, error: 'The QR code must be a PNG or JPEG image under 1 MB.' };
    value.paymentQr = qr;
  }
  if (!EMAIL_RE.test(value.ownerEmail)) return { ok: false, error: 'Enter the email address for your notifications.' };
  if (!value.ownerName) return { ok: false, error: 'Enter your name for the Execution page.' };
  if (!value.senderName) return { ok: false, error: 'Enter the sender name.' };
  if (!EMAIL_RE.test(value.senderEmail)) return { ok: false, error: 'Enter a valid sender email.' };
  if (value.replyTo && !EMAIL_RE.test(value.replyTo)) return { ok: false, error: 'Enter a valid reply-to email.' };
  if (!value.replyTo) value.replyTo = value.senderEmail;
  return { ok: true, value };
}

/** A welcome-email template from the owner: new lines normalised, trimmed; the default (or nothing) is stored as ''. */
function normTemplate(raw: unknown, dflt: string): string {
  const v = String(raw ?? '').replace(/\r\n?/g, '\n').trim();
  return !v || v === dflt.trim() ? '' : v;
}

// ------------------------------------------------------------------ tokens and grants

function grantKey(): Buffer {
  const secret = process.env.AUTH_SECRET || '';
  if (secret.length < 32) throw new Error('AUTH_SECRET is not configured (needs at least 32 characters).');
  return Buffer.from(crypto.hkdfSync('sha256', secret, 'appointmentlyy', 'agreements-grants-v1', 32));
}

const hmac = (s: string) => crypto.createHmac('sha256', grantKey()).update(s).digest('base64url');

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** A new signing link token: 32 random bytes (256 bits). Only its hash and a sealed copy are stored. */
export function newSigningToken(envelopeId: string): { token: string; hash: string; sealed: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: sha256Hex(token), sealed: seal(token, `agreement_token|${envelopeId}`) };
}

export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const tokenHashOf = (token: string) => sha256Hex(token);

export function unsealToken(e: Envelope): string | null {
  if (!e.tokenSealed) return null;
  try {
    return open(e.tokenSealed, `agreement_token|${e.id}`);
  } catch {
    return null;
  }
}

export function signingUrl(token: string, origin?: string): string {
  return `${getAppBaseUrl(origin)}/s/${token}`;
}

// ------------------------------------------------------------------ copy (CC) recipients

/**
 * A copy recipient's view-only token: 256 random bits, like the signer's, but its own. Sealed with a
 * different context (bound to the envelope AND the copy) and looked up only by the view-only routes,
 * so it can never open the signer's routes, and the signer's token never opens a copy's page.
 */
export function newCcToken(envelopeId: string, ccId: string): { token: string; hash: string; sealed: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: sha256Hex(token), sealed: seal(token, `agreement_cc_token|${envelopeId}|${ccId}`) };
}

export function unsealCcToken(envelopeId: string, cc: CcRecipient): string | null {
  if (!cc.tokenSealed || cc.removedAt) return null;
  try {
    return open(cc.tokenSealed, `agreement_cc_token|${envelopeId}|${cc.id}`);
  } catch {
    return null;
  }
}

export const newCcId = () => crypto.randomBytes(9).toString('base64url');

/** The copy recipient's page: view only. */
export function ccViewUrl(token: string, origin?: string): string {
  return `${getAppBaseUrl(origin)}/s/view/${token}`;
}

/** A copy recipient's visit: HMAC-bound to the envelope AND the copy (never valid on the signer routes). */
export function issueCcVisit(envelopeId: string, ccId: string): string {
  const visitId = crypto.randomBytes(9).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 4 * 3600;
  const body = `c1.${visitId}.${exp}`;
  return `${body}.${hmac(`ccvisit|${envelopeId}|${ccId}|${body}`)}`;
}

export function checkCcVisit(envelopeId: string, ccId: string, v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 200) return null;
  const parts = v.split('.');
  if (parts.length !== 4 || parts[0] !== 'c1') return null;
  const body = parts.slice(0, 3).join('.');
  if (!safeEqual(parts[3], hmac(`ccvisit|${envelopeId}|${ccId}|${body}`))) return null;
  if (Number(parts[2]) < Date.now() / 1000) return null;
  return parts[1];
}

/**
 * Copy recipients from the owner: optional name, valid email, at most 5, no duplicates, never the
 * signer's own address. Returns cleaned entries (lowercased emails) or a message for the owner.
 */
export function validateCopies(raw: unknown, signerEmail: string): { ok: true; value: { name: string; email: string }[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: 'Send the copy recipients as a list.' };
  if (raw.length > CC_LIMITS.max) return { ok: false, error: `You can copy at most ${CC_LIMITS.max} people (${CC_LIMITS.totalRecipients} recipients in all).` };
  const signer = signerEmail.trim().toLowerCase();
  const seen = new Set<string>();
  const out: { name: string; email: string }[] = [];
  for (const [i, item] of raw.entries()) {
    const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const name = String(r.name ?? '').trim().replace(/\s+/g, ' ').slice(0, AGREEMENT_LIMITS.nameMax);
    const email = String(r.email ?? '').trim().toLowerCase();
    if (!email && !name) continue;
    const n = i + 1;
    if (email.length > AGREEMENT_LIMITS.emailMax || !EMAIL_RE.test(email)) return { ok: false, error: `Copy ${n}: enter a valid email address.` };
    if (signer && email === signer) return { ok: false, error: `Copy ${n}: ${email} is the signer. The signer gets their own email, so leave them out of the copies.` };
    if (seen.has(email)) return { ok: false, error: `Copy ${n}: ${email} is already in the list.` };
    seen.add(email);
    out.push({ name, email });
  }
  return { ok: true, value: out };
}

export function consoleUrl(id: string, origin?: string): string {
  return `${getAppBaseUrl(origin)}/platform/agreements/${id}`;
}

/** Signed "visit" (one open of the link): lets the viewer fetch the PDF and send heartbeats. 4 hours. */
export function issueVisit(envelopeId: string): string {
  const visitId = crypto.randomBytes(9).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 4 * 3600;
  const body = `v1.${visitId}.${exp}`;
  return `${body}.${hmac(`visit|${envelopeId}|${body}`)}`;
}

export function checkVisit(envelopeId: string, v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 200) return null;
  const parts = v.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  const body = parts.slice(0, 3).join('.');
  if (!safeEqual(parts[3], hmac(`visit|${envelopeId}|${body}`))) return null;
  if (Number(parts[2]) < Date.now() / 1000) return null;
  return parts[1];
}

/** After the view code is verified (requireOtpToView): 12 hours. */
export function issueViewGrant(envelopeId: string): string {
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const body = `g1.${exp}`;
  return `${body}.${hmac(`view|${envelopeId}|${body}`)}`;
}

export function checkViewGrant(envelopeId: string, g: unknown): boolean {
  if (typeof g !== 'string' || g.length > 200) return false;
  const parts = g.split('.');
  if (parts.length !== 3 || parts[0] !== 'g1') return false;
  if (!safeEqual(parts[2], hmac(`view|${envelopeId}|${parts[0]}.${parts[1]}`))) return false;
  return Number(parts[1]) >= Date.now() / 1000;
}

export function hashOtp(envelopeId: string, purpose: string, code: string): string {
  return crypto.createHmac('sha256', grantKey()).update(`otp|${envelopeId}|${purpose}|${code}`).digest('hex');
}

export function newOtpCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function otpMatches(stored: string, candidate: string): boolean {
  const a = Buffer.from(stored, 'hex');
  const b = Buffer.from(candidate, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ------------------------------------------------------------------ access rules

export type Access =
  | { kind: 'open' }
  | { kind: 'not_yet'; openFrom: string }
  | { kind: 'signed' }
  | { kind: 'completed'; downloadUntil: string }
  | { kind: 'closed'; reason: 'expired' | 'revoked' | 'declined' | 'not_found' | 'limit' };

/** Status- and time-based rules (max opens is checked when a visit starts). */
export function evaluateAccess(e: Envelope, now = Date.now()): Access {
  switch (e.status) {
    case 'draft':
      return { kind: 'closed', reason: 'not_found' };
    case 'revoked':
      return { kind: 'closed', reason: 'revoked' };
    case 'declined':
      return { kind: 'closed', reason: 'declined' };
    case 'expired':
      return { kind: 'closed', reason: 'expired' };
    case 'completed': {
      const until = Date.parse(e.completedAt || e.updatedAt) + e.access.downloadDays * 86_400_000;
      return now <= until ? { kind: 'completed', downloadUntil: new Date(until).toISOString() } : { kind: 'closed', reason: 'expired' };
    }
    case 'signed':
      return { kind: 'signed' };
    case 'sent':
    case 'opened': {
      if (pastExpiry(e, now)) return { kind: 'closed', reason: 'expired' };
      if (e.access.openFrom && now < Date.parse(e.access.openFrom)) return { kind: 'not_yet', openFrom: e.access.openFrom };
      return { kind: 'open' };
    }
  }
}

export function pastExpiry(e: Envelope, now = Date.now()): boolean {
  if (e.access.expiresAt && now > Date.parse(e.access.expiresAt)) return true;
  if (e.access.openUntil && now > Date.parse(e.access.openUntil)) return true;
  return false;
}

export function opensExhausted(e: Envelope): boolean {
  return e.access.maxOpens !== null && e.opens >= e.access.maxOpens;
}

const parseIso = (v: unknown): string | null | 'bad' => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || v.length > 40) return 'bad';
  const t = Date.parse(v);
  return Number.isNaN(t) ? 'bad' : new Date(t).toISOString();
};

/** Validate access rules from the owner. `base` supplies values not given. */
export function validateAccess(raw: unknown, base?: AccessRules): { ok: true; value: AccessRules } | { ok: false; error: string } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const expires = 'expiresAt' in r ? parseIso(r.expiresAt) : base?.expiresAt ?? null;
  const openFrom = 'openFrom' in r ? parseIso(r.openFrom) : base?.openFrom ?? null;
  const openUntil = 'openUntil' in r ? parseIso(r.openUntil) : base?.openUntil ?? null;
  if (expires === 'bad' || openFrom === 'bad' || openUntil === 'bad') return { ok: false, error: 'Enter valid dates for the link rules.' };
  const expiresAt = expires ?? new Date(Date.now() + AGREEMENT_LIMITS.defaultExpiryDays * 86_400_000).toISOString();
  if (openFrom && openUntil && Date.parse(openUntil) <= Date.parse(openFrom)) return { ok: false, error: '“Open until” must be after “Open from”.' };
  let maxOpens: number | null = base?.maxOpens ?? null;
  if ('maxOpens' in r) {
    if (r.maxOpens === null || r.maxOpens === '' || r.maxOpens === undefined) maxOpens = null;
    else {
      const n = Number(r.maxOpens);
      if (!Number.isInteger(n) || n < 1 || n > AGREEMENT_LIMITS.maxOpensMax) return { ok: false, error: `Maximum opens must be a whole number from 1 to ${AGREEMENT_LIMITS.maxOpensMax}.` };
      maxOpens = n;
    }
  }
  let downloadDays = base?.downloadDays ?? AGREEMENT_LIMITS.defaultDownloadDays;
  if ('downloadDays' in r && r.downloadDays !== undefined && r.downloadDays !== '') {
    const n = Number(r.downloadDays);
    if (!Number.isInteger(n) || n < 1 || n > AGREEMENT_LIMITS.downloadDaysMax) return { ok: false, error: `Download days must be from 1 to ${AGREEMENT_LIMITS.downloadDaysMax}.` };
    downloadDays = n;
  }
  const requireOtpToView = 'requireOtpToView' in r ? r.requireOtpToView === true : base?.requireOtpToView ?? false;
  return { ok: true, value: { expiresAt, openFrom, openUntil, maxOpens, requireOtpToView, downloadDays } };
}

/** Owner field values: only the template's keys, strings, size-limited. Required/format checks at send. */
export function cleanFieldValues(t: AgreementTemplate, raw: unknown): Record<string, string> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  // Templates with a structured value (the custom proposal's document) rebuild their own values.
  const own = (t as TemplateHooks).cleanValues;
  if (typeof own === 'function') return own(r);
  const out: Record<string, string> = {};
  for (const f of t.fields) {
    const v = r[f.key];
    if (v === undefined || v === null) {
      if (f.default !== undefined) out[f.key] = f.default;
      continue;
    }
    // Billing statements: the QR image is re-checked and rebuilt on the server; anything else is dropped.
    if (isPaymentQrKey(f.key)) out[f.key] = safeQrDataUrl(v) ?? '';
    // Bank transfer details and the PayPal fee note are single-line (format and length checked at send).
    else if (SINGLE_LINE_PAY_KEYS.has(f.key)) out[f.key] = oneLine(v, 1000);
    else out[f.key] = String(v).slice(0, AGREEMENT_LIMITS.fieldValueMax);
  }
  return out;
}

const SINGLE_LINE_PAY_KEYS = new Set<string>([...BANK_KEYS, 'paypalLink', 'paypalFeeNote']);

/** Optional template hooks (custom proposal): own value cleaning, own send checks, watched-page labels. */
export type TemplateHooks = AgreementTemplate & {
  cleanValues?: (raw: Record<string, unknown>) => Record<string, string>;
  valueProblems?: (values: Record<string, string>) => string | null;
  watchLabels?: (values: Record<string, string>) => (string | null)[];
  actionFor?: (values: Record<string, string>) => { action: AgreementTemplate['action']; countersign: boolean };
};

export function fieldProblems(t: AgreementTemplate, values: Record<string, string>): string | null {
  const own = (t as TemplateHooks).valueProblems;
  if (typeof own === 'function') {
    const p = own(values);
    if (p) return p;
  }
  for (const f of t.fields) {
    const v = (values[f.key] ?? '').trim();
    if (f.required && !v) return `Fill in “${f.label}”.`;
    if (!v) continue;
    if (isPaymentLinkKey(f.key) && !safePaymentLink(v)) return 'The payment link must be a full https:// address.';
    if (f.type === 'email' && !EMAIL_RE.test(v)) return `“${f.label}” must be an email address.`;
    if ((f.type === 'number' || f.type === 'money') && Number.isNaN(Number(v.replace(/[,\s]/g, '')))) return `“${f.label}” must be a number.`;
    if (f.type === 'select' && f.options?.length && !f.options.includes(v)) return `Pick one of the options for “${f.label}”.`;
  }
  // Billing statements: bank transfer details (all or nothing, formats) and the PayPal link (paypal.me / paypal.com).
  if (t.fields.some((f) => SINGLE_LINE_PAY_KEYS.has(f.key))) {
    const p = paymentOptionsProblem(values);
    if (p) return p;
    // The note used to be required; a statement still needs at least one way to pay.
    const any = ['paymentLink', 'paypalLink', 'paymentQr', 'paymentInstructions'].some((k) => (values[k] ?? '').trim()) || hasBank(values);
    if (t.action === 'view' && !any) return 'Add at least one way to pay: a Wise link, bank transfer details, a PayPal link, a QR code or a payment note.';
  }
  return null;
}

export function cleanRecipient(raw: unknown): { name: string; title: string; email: string } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    name: String(r.name ?? '').trim().slice(0, AGREEMENT_LIMITS.nameMax),
    title: String(r.title ?? '').trim().slice(0, AGREEMENT_LIMITS.nameMax),
    email: String(r.email ?? '').trim().toLowerCase().slice(0, AGREEMENT_LIMITS.emailMax),
  };
}

/** Validate the signer's answers against the frozen signer form. Returns cleaned answers or an error. */
export function validateSignerAnswers(form: SignerFormField[], raw: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const f of form) {
    const v = r[f.key];
    switch (f.kind) {
      case 'choice': {
        const s = typeof v === 'string' ? v : '';
        if (!s) {
          if (f.required) return { ok: false, error: `Choose an option for “${f.label}”.` };
          break;
        }
        if (f.options?.length && !f.options.includes(s)) return { ok: false, error: `Choose one of the options for “${f.label}”.` };
        out[f.key] = s;
        break;
      }
      case 'multi-check': {
        const arr = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
        const allowed = f.options ?? [];
        if (arr.some((x) => !allowed.includes(x))) return { ok: false, error: `Unknown option in “${f.label}”.` };
        const uniq = allowed.filter((o) => arr.includes(o));
        if (f.required && uniq.length === 0) return { ok: false, error: `Tick at least one item in “${f.label}”.` };
        out[f.key] = uniq;
        break;
      }
      case 'text': {
        const s = typeof v === 'string' ? v.trim().slice(0, 1000) : '';
        if (f.required && !s) return { ok: false, error: `Fill in “${f.label}”.` };
        if (s) out[f.key] = s;
        break;
      }
      case 'date': {
        const s = typeof v === 'string' ? v.trim() : '';
        if (!s) {
          if (f.required) return { ok: false, error: `Pick a date for “${f.label}”.` };
          break;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) return { ok: false, error: `Enter a valid date for “${f.label}”.` };
        out[f.key] = s;
        break;
      }
      case 'confirm': {
        const b = v === true;
        if (f.required && !b) return { ok: false, error: `Please confirm: “${f.label}”.` };
        out[f.key] = b;
        break;
      }
      case 'rows': {
        const cols = f.columns ?? [];
        const max = f.maxRows ?? 10;
        const rows = Array.isArray(v) ? v : [];
        const clean: string[][] = [];
        for (const row of rows.slice(0, max + 5)) {
          const cells = Array.isArray(row) ? row : cols.map((c) => (row as Record<string, unknown>)?.[c]);
          const cleaned = cols.map((_, i) => String(cells[i] ?? '').trim().slice(0, 300));
          if (cleaned.some(Boolean)) clean.push(cleaned);
        }
        if (clean.length > max) return { ok: false, error: `“${f.label}” takes at most ${max} rows.` };
        if (f.required && !clean.length) return { ok: false, error: `Add at least one row to “${f.label}”.` };
        out[f.key] = clean;
        break;
      }
    }
  }
  return { ok: true, value: out };
}

/** A signature image: PNG data URL, at most 200 KB decoded, sane dimensions. */
export function decodeSignaturePng(v: unknown): Buffer | null {
  if (typeof v !== 'string' || v.length > 300_000) return null;
  const m = v.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length < 60 || buf.length > AGREEMENT_LIMITS.signatureMaxBytes) return null;
  if (!buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (w < 10 || h < 10 || w > 2400 || h > 1200) return null;
  return buf;
}

// ------------------------------------------------------------------ request helpers

export const NOINDEX = 'noindex, nofollow, noarchive';
export const PRIVATE_HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': NOINDEX, 'Referrer-Policy': 'no-referrer' };

export function json(body: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

export function fail(status: number, error: string, extra: Record<string, unknown> = {}): NextResponse {
  return json({ success: false, error, ...extra }, status);
}

export function pdfResponse(bytes: Uint8Array, filename: string): NextResponse {
  const safe = filename.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 120) || 'document.pdf';
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      ...PRIVATE_HEADERS,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${safe}"`,
      'Content-Length': String(bytes.length),
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/**
 * The client's IP for evidence (events, Certificate of Completion) and rate limits: ONE helper for all.
 *
 * X-Forwarded-For entries left of our trusted proxy are whatever the client sent, so the leftmost
 * entry can be forged. Railway's edge proxy appends the address it saw, so with one trusted hop the
 * real client is the RIGHTMOST entry. (Railway also documents X-Real-IP as the client's remote IP;
 * it is the fallback when there is no X-Forwarded-For.) AGREEMENTS_TRUSTED_PROXY_HOPS (default 1)
 * covers an extra proxy in front of Railway, such as a CDN.
 */
export function ipFromHeaders(xff: string | null | undefined, realIp: string | null | undefined, hops = trustedHops()): string {
  const parts = String(xff || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const pick = parts.length ? parts[Math.max(0, parts.length - hops)] : String(realIp || '').trim();
  const ip = (pick || 'unknown').slice(0, 100);
  return /^[0-9A-Za-z:.%_-]+$/.test(ip) ? ip : 'unknown';
}

function trustedHops(): number {
  const n = Number(process.env.AGREEMENTS_TRUSTED_PROXY_HOPS || 1);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 1;
}

export function clientIp(req: NextRequest): string {
  return ipFromHeaders(req.headers.get('x-forwarded-for'), req.headers.get('x-real-ip'));
}

export function userAgentOf(req: NextRequest): string {
  return (req.headers.get('user-agent') || '').slice(0, 400);
}

export async function readJson(req: NextRequest, maxBytes = 64 * 1024): Promise<Record<string, unknown> | null> {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > maxBytes) return null;
  try {
    const text = await req.text();
    if (text.length > maxBytes) return null;
    const v = text ? JSON.parse(text) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Platform owner only: platform staff signed in to the Appointmentlyy workspace. */
export async function requireOwner(req: NextRequest): Promise<ServerSession | NextResponse> {
  const session = await getServerSession(req);
  if (!session) return fail(401, 'Please sign in again.');
  if (!session.isPlatformAdmin || session.tenantCode !== PLATFORM_TENANT_CODE) {
    return fail(403, 'Agreements are only for the platform owner, in the Appointmentlyy workspace.');
  }
  return session;
}

export function fileNameFor(e: Envelope, suffix: string): string {
  const base = e.title.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'agreement';
  return `${base}${suffix}.pdf`;
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  return `${user.slice(0, 1)}${'*'.repeat(Math.max(2, Math.min(6, user.length - 1)))}@${domain}`;
}
