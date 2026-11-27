/**
 * Do Not Contact (suppression) list: the shared, pure rules (no I/O), used by the server routes and the browser.
 *
 * Each workspace keeps one list on the server (src/lib/server/suppressionStore.ts). An entry is one phone number or
 * one email address, with the reason, who added it and when. Marking a lead "Do not call" in the Dialer adds its
 * phone and email; the Dialer, the VICIdial dial relay and every server email send check the list before they act.
 *
 * Matching
 * - Email: trimmed and lower-cased ("Name <a@b.co>" becomes "a@b.co"). Exact match.
 * - Phone: stored as E.164 ("+14155550142") when the number carries its country code ("+" or "00"), otherwise as the
 *   digits typed (national format, e.g. "0412345678"). Two numbers match when their last 9 digits are the same, so
 *   "+61 412 345 678" matches "0412 345 678" and "+1 (415) 555-0142" matches "415-555-0142". A number shorter than
 *   9 digits only matches itself. The rare false match errs on the side of not calling.
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

/** A phone number in its stored form, or null when it is not a phone number. */
export function normalizePhone(raw: unknown): { value: string; e164: boolean } | null {
  if (typeof raw !== 'string') return null;
  let s = raw.replace(CONTROL_RE, ' ').trim();
  if (!s || s.length > 40) return null;
  s = s.replace(/^tel:/i, '').trim();
  // A trailing extension is not part of the number ("x12", "ext. 12", "#12", ";ext=12").
  s = s.replace(/\s*(?:;ext=|ext\.?|extension|x|#)\s*\d{1,6}\s*$/i, '').trim();
  if (!/^[+\d\s().\-/]+$/.test(s)) return null;
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

/** The key two phone numbers are compared by (see the header). */
export function phoneMatchKey(raw: unknown): string | null {
  const n = normalizePhone(raw);
  if (!n) return null;
  const digits = n.value.replace(/\D/g, '');
  return digits.length >= PHONE_TAIL ? digits.slice(-PHONE_TAIL) : digits;
}

const EMAIL_RE = /^[^\s@<>"(),;:]+@[^\s@<>"(),;:]+\.[^\s@<>"(),;:]{2,}$/;

/** The lower-case address, or null when it is not an email address. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let s = raw.replace(CONTROL_RE, ' ').trim();
  if (!s || s.length > 320) return null;
  const angle = s.match(/<([^<>]+)>\s*$/);
  if (angle) s = angle[1];
  s = s.replace(/^mailto:/i, '').trim().toLowerCase();
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
  const pk = phoneMatchKey(phone);
  const ek = normalizeEmail(email);
  let p: T | null = null;
  let e: T | null = null;
  for (const x of list) {
    if (!p && pk && x.kind === 'phone' && x.matchKey === pk) p = x;
    if (!e && ek && x.kind === 'email' && x.matchKey === ek) e = x;
    if ((p || !pk) && (e || !ek)) break;
  }
  return { phone: p, email: e };
}

/**
 * Which call outcomes put the lead on the list, and why. Outcomes whose automation is "TCPA DNC Quarantine"
 * (dnc_quarantine) or whose name/code says do-not-call / opt-out / unsubscribe do; "Wrong number" outcomes with the
 * DNC automation suppress only the number (the email may still be right). Every other outcome: null (unchanged).
 * "Not interested" is not a request to stop contact, so it never suppresses.
 */
export function suppressionReasonForOutcome(outcome: { name?: string; code?: string; actionTrigger?: string } | null | undefined): SuppressionReason | null {
  if (!outcome) return null;
  const text = `${outcome.name || ''} ${outcome.code || ''}`.toLowerCase();
  const dncAutomation = outcome.actionTrigger === 'dnc_quarantine';
  if (/wrong[\s_-]*number|invalid[\s_-]*(number|extension)/.test(text)) return dncAutomation ? 'wrong_number' : null;
  if (dncAutomation || /\bdnc\b|do[\s_-]*not[\s_-]*(call|contact)/.test(text)) return 'do_not_call';
  if (/opt[\s_-]*out|unsubscribe/.test(text)) return 'opt_out';
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
