/**
 * Do Not Contact (suppression) list: the shared, pure rules (no I/O), used by the server routes and the browser.
 *
 * Each workspace keeps one list on the server (src/lib/server/suppressionStore.ts). An entry is one phone number or
 * one email address, with the reason, who added it and when. Marking a lead "Do not call" in the Dialer adds its
 * phone and email; the Dialer, the VICIdial dial relay and every server email send check the list before they act.
 *
 * Matching
 * - Email: trimmed and lower-cased ("Name <a@b.co>" becomes "a@b.co"). Exact match.
 * - Phone: the number is read from the start of the field up to the first letter, "/", "#", ";" or "," (so
 *   "+1 415 555 0178 cell", "415-555-0177 (mobile)" or "Mobile: +1 415 ..." are read as the number they hold). It is
 *   stored as E.164 ("+14155550142") when it carries its country code ("+" or "00"), otherwise as the digits typed
 *   (national format, e.g. "0412345678").
 *   The match key (phoneMatchKey): for a national number the trunk 0 is dropped first ("0412 345 678" -> 412345678,
 *   "09 123 4567" -> 91234567); a national number of 8 digits or fewer is its own key, a longer one its last 9 digits.
 *   An E.164 number of 11+ digits is keyed by its last 9 digits; one of 10 digits or fewer (a 2-digit country code and
 *   an 8-digit number: New Zealand landlines, Singapore, ...) by its last 8. Lookups (phoneLookupKeys) produce every
 *   key the stored side can have (9- and 8-digit tails, with and without a trunk 0), so "+61 412 345 678" matches
 *   "0412 345 678", "+1 (415) 555-0142" matches "415-555-0142", "+64 9 123 4567" matches "09 123 4567" and
 *   "+65 6123 4567" matches "6123 4567". US numbers keep their 9-digit keys, so two US numbers never match on 8 digits.
 *   The rare false match errs on the side of not calling.
 */

export type SuppressionKind = 'phone' | 'email';
export type SuppressionReason = 'do_not_call' | 'opt_out' | 'wrong_number' | 'other';
/**
 * Where an entry came from. 'unsubscribe' (an email unsubscribe link) and 'inbox' (a reply marked "opted out") are
 * reserved for those future features; only 'dialer' and 'manual' may be given in a request body, the rest are set by
 * the server.
 */
export type SuppressionSource = 'dialer' | 'manual' | 'api' | 'unsubscribe' | 'inbox';

export const SUPPRESSION_REASONS: readonly SuppressionReason[] = ['do_not_call', 'opt_out', 'wrong_number', 'other'];
export const SUPPRESSION_SOURCES: readonly SuppressionSource[] = ['dialer', 'manual', 'api', 'unsubscribe', 'inbox'];
const CLIENT_SOURCES: readonly SuppressionSource[] = ['dialer', 'manual'];

export const SUPPRESSION_REASON_LABEL: Record<SuppressionReason, string> = {
  do_not_call: 'Asked not to be contacted',
  opt_out: 'Opted out',
  wrong_number: 'Wrong number',
  other: 'Other',
};

/** One entry as the server stores it. */
export interface SuppressionEntry {
  id: string;
  tenantCode: string;
  kind: SuppressionKind;
  /** E.164 / national digits for a phone, the lower-case address for an email. */
  value: string;
  /** What lookups compare: the phone's last 9 digits (or all of them when shorter), or the email address. */
  matchKey: string;
  reason: SuppressionReason;
  note: string;
  source: SuppressionSource;
  createdByEmail: string;
  createdByName: string;
  createdAt: string;
  removedAt: string | null;
  removedByEmail: string | null;
  removedByName: string | null;
  removalNote: string | null;
}

/** What GET /api/suppression gives the browser (no emails of the people who added entries). */
export interface SuppressionListItem {
  id: string;
  kind: SuppressionKind;
  value: string;
  matchKey: string;
  reason: SuppressionReason;
  source: SuppressionSource;
  createdAt: string;
  createdByName: string;
}

export const MAX_NOTE_LENGTH = 300;
const PHONE_TAIL = 9;

const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

/**
 * The number part of a phone field: a leading label ("Mobile:", "tel:") is skipped, and the number ends at the first
 * letter, "/", "#", ";" or "," ("415-555-0177 (mobile)", "+1 415 555 0178 cell", "415 555 0179 / main",
 * "+1 415 555 0142 ext. 12"). Used by every add path, so what is stored is what the dial guard reads.
 */
export function extractPhone(raw: string): string {
  const s = raw.replace(CONTROL_RE, ' ').replace(/[  -​‑ ]/g, ' ').slice(0, 100);
  const start = s.search(/[+\d(]/);
  if (start < 0) return '';
  const rest = s.slice(start);
  const end = rest.search(/[A-Za-z/#;,]/);
  return (end < 0 ? rest : rest.slice(0, end)).replace(/[\s(\-.]+$/, '').trim();
}

/** A phone number in its stored form, or null when it is not a phone number. */
export function normalizePhone(raw: unknown): { value: string; e164: boolean } | null {
  if (typeof raw !== 'string') return null;
  const s = extractPhone(raw);
  if (!s || s.length > 40) return null;
  if (!/^[+\d\s().\-]+$/.test(s)) return null;
  const international = /^(?:\+|00)/.test(s);
  let digits = s.replace(/\D/g, '');
  if (s.startsWith('00')) digits = digits.slice(2);
  if (international) {
    if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) return null;
    return { value: `+${digits}`, e164: true };
  }
  if (digits.length < 7 || digits.length > 15) return null;
  return { value: digits, e164: false };
}

/** Short E.164 numbers (a 2-digit country code and an 8-digit number) are keyed by their last 8 digits. */
const SHORT_E164 = 10;
const SHORT_TAIL = 8;

/** The stored key for a normalized number (see the header). */
function keyOf(digits: string, e164: boolean): string | null {
  if (e164) return digits.length <= SHORT_E164 ? digits.slice(-SHORT_TAIL) : digits.slice(-PHONE_TAIL);
  const nsn = digits.replace(/^0(?=[1-9])/, ''); // the national trunk prefix
  if (nsn.length < 7) return null;
  return nsn.length <= SHORT_TAIL ? nsn : nsn.slice(-PHONE_TAIL);
}

/** The key two phone numbers are compared by (see the header). This is what is stored. */
export function phoneMatchKey(raw: unknown): string | null {
  const n = normalizePhone(raw);
  if (!n) return null;
  return keyOf(n.value.replace(/\D/g, ''), n.e164);
}

/** Every key the stored side can have for a run of digits: 9- and 8-digit tails, with and without a trunk 0 / 00. */
function addDigitKeys(d: string, out: Set<string>) {
  const variants = [d];
  if (/^00/.test(d)) variants.push(d.slice(2));
  else if (/^0[1-9]/.test(d)) variants.push(d.slice(1));
  for (const v of variants) {
    if (v.length < 7) continue;
    out.add(v.length >= PHONE_TAIL ? v.slice(-PHONE_TAIL) : v);
    if (v.length >= SHORT_TAIL) out.add(v.slice(-SHORT_TAIL));
  }
}

/**
 * Every key a lookup (a dial, a Dialer badge, a check) must try for this number. Lenient on purpose, so a number that
 * is not "clean" can never skip the check: "415-555-0161 (mobile)", "+1 415 555 0161 cell" or "... x 12 (desk)" are
 * still found. Uses the strict key (phoneMatchKey), all the digits in the text, and the digits of the number part
 * (extractPhone), each as every key the stored side could have. Empty: no number in it at all.
 */
export function phoneLookupKeys(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  const s = raw.replace(CONTROL_RE, ' ').slice(0, 100);
  const out = new Set<string>();
  const strict = phoneMatchKey(s);
  if (strict) out.add(strict);
  for (const part of [s, extractPhone(s), s.split(/;ext=|ext|extension|x|#|,/i)[0]]) addDigitKeys(part.replace(/\D/g, ''), out);
  return [...out];
}

const EMAIL_RE = /^[^\s@<>"(),;:]+@[^\s@<>"(),;:]+\.[^\s@<>"(),;:]{2,}$/;
// Invisible characters that would make two spellings of one address differ (zero-width space/joiners, BOM, word joiner).
const INVISIBLE_RE = /[­᠎​-‏⁠-⁤﻿]/g;

/** The lower-case address, or null when it is not an email address. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let s = raw.replace(INVISIBLE_RE, '').replace(CONTROL_RE, ' ').trim();
  if (!s || s.length > 320) return null;
  const angle = s.match(/<([^<>]+)>\s*$/);
  if (angle) s = angle[1];
  // "a@x.com." (fully qualified domain) is delivered to a@x.com: compare without the trailing dot.
  s = s.replace(/^mailto:/i, '').trim().toLowerCase().replace(/\.+$/, '');
  if (s.length > 254 || !EMAIL_RE.test(s)) return null;
  return s;
}

/** A short single-line note (control characters and line breaks become spaces). */
export function cleanNote(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(CONTROL_RE, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE_LENGTH);
}

/** The entries of `list` that block this phone and this email (null where nothing matches). */
export function matchSuppression<T extends Pick<SuppressionListItem, 'kind' | 'matchKey'>>(
  list: readonly T[],
  phone: unknown,
  email: unknown,
): { phone: T | null; email: T | null } {
  const pks = phoneLookupKeys(phone);
  const ek = normalizeEmail(email);
  let p: T | null = null;
  let e: T | null = null;
  for (const x of list) {
    if (!p && pks.length && x.kind === 'phone' && pks.includes(x.matchKey)) p = x;
    if (!e && ek && x.kind === 'email' && x.matchKey === ek) e = x;
    if ((p || !pks.length) && (e || !ek)) break;
  }
  return { phone: p, email: e };
}

/**
 * Which call outcomes put the lead on the list, and why. Outcomes whose automation is "TCPA DNC Quarantine"
 * (dnc_quarantine) or whose name/code says do-not-call / opt-out / unsubscribe do; "Wrong number" outcomes with the
 * DNC automation suppress only the number (the email may still be right). Every other outcome: null (unchanged).
 * "Not interested" is not a request to stop contact, so it never suppresses. By name: "Opt out", "Opt-out", "Opted
 * out", "Unsubscribe(d)", "DNC", "Do not call", "Don't call", "Do not contact" suppress; a timing request ("Do not call
 * back today", "Callback - don't call before 3pm", "call later / after / until / tomorrow") does not.
 */
const OPT_OUT_RE = /\bopt(?:ed|s|ing)?[\s_-]*out\b|\bunsubscrib/;
const DO_NOT_CALL_RE = /\bdnc\b|\b(?:do[\s_-]*not|don'?t|dont)[\s_-]*(?:call|contact)\b/;
const TIMING_RE = /call[\s_-]*back|callback|\b(?:before|after|until|till|today|tonight|tomorrow|later|next[\s_-]*week|this[\s_-]*week)\b/;

export function suppressionReasonForOutcome(outcome: { name?: string; code?: string; actionTrigger?: string } | null | undefined): SuppressionReason | null {
  if (!outcome) return null;
  const text = `${outcome.name || ''} ${outcome.code || ''}`.toLowerCase().replace(/[‘’]/g, "'");
  const dncAutomation = outcome.actionTrigger === 'dnc_quarantine';
  if (/wrong[\s_-]*number|invalid[\s_-]*(number|extension)/.test(text)) return dncAutomation ? 'wrong_number' : null;
  // The admin's automation decides for the outcomes it is set on (every default outcome mapping is unchanged).
  if (dncAutomation) return 'do_not_call';
  if (DO_NOT_CALL_RE.test(text) && !TIMING_RE.test(text)) return 'do_not_call';
  if (OPT_OUT_RE.test(text)) return 'opt_out';
  return null;
}

/** Which channels an outcome's reason suppresses: a wrong number stops calls only, everything else stops both. */
export const reasonSuppressesEmail = (reason: SuppressionReason) => reason !== 'wrong_number';

export interface NewSuppressionInput {
  phone: { value: string; matchKey: string } | null;
  email: string | null;
  reason: SuppressionReason;
  note: string;
  source: SuppressionSource;
}

/** Check a POST body. The workspace and who is adding come from the session, never from here. */
export function validateSuppressionInput(
  body: unknown,
  forced?: { reason?: SuppressionReason; source?: SuppressionSource },
): { ok: true; value: NewSuppressionInput } | { ok: false; field: string; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, field: 'body', error: 'Invalid request.' };
  const b = body as Record<string, unknown>;
  const reasonRaw = forced?.reason ?? (b.reason === undefined ? 'do_not_call' : b.reason);
  if (typeof reasonRaw !== 'string' || !SUPPRESSION_REASONS.includes(reasonRaw as SuppressionReason)) {
    return { ok: false, field: 'reason', error: 'Unknown reason.' };
  }
  const reason = reasonRaw as SuppressionReason;
  const sourceRaw = forced?.source ?? (b.source === undefined ? 'manual' : b.source);
  const allowedSources = forced?.source ? SUPPRESSION_SOURCES : CLIENT_SOURCES;
  if (typeof sourceRaw !== 'string' || !allowedSources.includes(sourceRaw as SuppressionSource)) {
    return { ok: false, field: 'source', error: 'Unknown source.' };
  }
  const hasPhone = b.phone !== undefined && b.phone !== null && b.phone !== '';
  const hasEmail = b.email !== undefined && b.email !== null && b.email !== '';
  const phone = hasPhone ? normalizePhone(b.phone) : null;
  if (hasPhone && !phone) return { ok: false, field: 'phone', error: 'That phone number is not valid.' };
  let email = hasEmail ? normalizeEmail(b.email) : null;
  if (hasEmail && !email) return { ok: false, field: 'email', error: 'That email address is not valid.' };
  if (!reasonSuppressesEmail(reason)) email = null; // a wrong number never blocks the lead's email
  if (!phone && !email) return { ok: false, field: 'phone', error: 'Give a phone number or an email address.' };
  if (b.note !== undefined && typeof b.note !== 'string') return { ok: false, field: 'note', error: 'Invalid note.' };
  return {
    ok: true,
    value: {
      phone: phone ? { value: phone.value, matchKey: phoneMatchKey(phone.value)! } : null,
      email,
      reason,
      note: cleanNote(b.note),
      source: sourceRaw as SuppressionSource,
    },
  };
}

/** Every recipient address in an email `to` (a string or a list); invalid ones are left out. */
export function recipientEmails(to: unknown): string[] {
  const raw = Array.isArray(to) ? to.slice(0, 50) : [to];
  const out: string[] = [];
  for (const r of raw) {
    if (typeof r !== 'string') continue;
    for (const part of r.split(/[,;]/)) {
      const e = normalizeEmail(part);
      if (e && !out.includes(e)) out.push(e);
    }
  }
  return out;
}

/**
 * For the send guards: every recipient in `to`, or invalid when any of it cannot be checked (so it is not sent).
 * Fails closed: a non-string entry, more than 50 entries, or a part that holds an "@" but is not a plain ASCII address
 * ('"julia"@x.com', homoglyphs, full-width letters) makes the whole send invalid, instead of being skipped by the
 * check and still reaching the provider. Parts without any "@" (the halves of '"Doe, J" <a@x.com>') carry no address.
 */
export function sendRecipients(to: unknown): { ok: true; emails: string[] } | { ok: false } {
  if (to === undefined || to === null || to === '') return { ok: true, emails: [] };
  const raw = Array.isArray(to) ? to : [to];
  if (raw.length > 50) return { ok: false };
  const out: string[] = [];
  for (const r of raw) {
    if (typeof r !== 'string') return { ok: false };
    for (const part of r.split(/[,;]/)) {
      if (!part.includes('@')) continue;
      const e = normalizeEmail(part);
      // eslint-disable-next-line no-control-regex
      if (!e || !/^[\x21-\x7e]+$/.test(e)) return { ok: false };
      if (!out.includes(e)) out.push(e);
    }
  }
  return { ok: true, emails: out };
}

export const toListItem = (e: SuppressionEntry): SuppressionListItem => ({
  id: e.id,
  kind: e.kind,
  value: e.value,
  matchKey: e.matchKey,
  reason: e.reason,
  source: e.source,
  createdAt: e.createdAt,
  createdByName: e.createdByName,
});
