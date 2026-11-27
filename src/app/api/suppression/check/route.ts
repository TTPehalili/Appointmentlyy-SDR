import { type NextRequest } from 'next/server';
import { getServerSession } from '@/lib/server/session';
import { limitPerUser } from '@/lib/server/userRateLimit';
import { canRemoveSuppression, checkSuppression, fail, isCrossSiteRequest, ok, readSmallJson } from '@/lib/server/suppressionApi';
import { normalizeEmail, phoneLookupKeys, type SuppressionEntry } from '@/lib/suppression';

/**
 * POST /api/suppression/check  { phone?, email? }  or  { contacts: [{ phone?, email? }, ...] } (at most 50)
 * Is this contact on the signed-in person's workspace Do Not Contact list? Answers per contact, blocked or not with the
 * reason, and never the list itself. Used by the Dialer for the lead on screen and right before it opens a tel: link,
 * by the meeting plan before its mailto: link, and by Contacts for the badges of the rows on screen.
 * Workspace admins (who may remove entries) also get the entry id, who added it and when.
 *
 * Fails closed: if the list cannot be checked the answer is 503 (the caller must not call or email). Before the
 * database table exists ("not set up") every contact is reported as not blocked, with notSetUp: true.
 */
const MAX_CHECK_CONTACTS = 50;

type Hit = { blocked: true; reason: SuppressionEntry['reason']; id?: string; createdByName?: string; createdAt?: string };
type Channel = Hit | { blocked: false } | null;

export async function POST(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return fail(401, 'Please sign in again.');
  if (isCrossSiteRequest(req)) return fail(403, 'Request refused.');
  const limited = limitPerUser('suppression-check', session, { maxRequests: 240, windowMs: 60_000 });
  if (limited) return limited;
  const body = await readSmallJson(req, 16_384);
  if (body === 'too_large') return fail(413, 'Request too large.');
  if (!body) return fail(400, 'Invalid request.');
  const raw: unknown[] = Array.isArray(body.contacts) ? body.contacts : [body];
  if (raw.length === 0 || raw.length > MAX_CHECK_CONTACTS) return fail(400, `Check between 1 and ${MAX_CHECK_CONTACTS} contacts at a time.`, { field: 'contacts' });

  // What each contact is looked up by (same keys as the dial and send guards).
  const items = raw.map((c) => {
    const o = c && typeof c === 'object' && !Array.isArray(c) ? (c as Record<string, unknown>) : {};
    const phoneGiven = typeof o.phone === 'string' && o.phone.trim() !== '';
    const emailGiven = typeof o.email === 'string' && o.email.trim() !== '';
    const phoneKeys = phoneGiven ? phoneLookupKeys(o.phone) : [];
    const email = emailGiven ? normalizeEmail(o.email) : null;
    return { phoneGiven, emailGiven, phoneKeys, email };
  });
  const phones = [...new Set(items.flatMap((i) => i.phoneKeys))];
  const emails = [...new Set(items.map((i) => i.email).filter((e): e is string => !!e))];

  const r = await checkSuppression(session.tenantCode, { phones, emails });
  if (r.state === 'error') {
    return fail(503, 'The Do Not Contact list could not be checked just now. Nothing was opened. Please try again.', { code: 'SUPPRESSION_CHECK_FAILED' });
  }
  const notSetUp = r.state === 'not_set_up';
  const hits = r.state === 'suppressed' ? r.hits : [];
  const admin = canRemoveSuppression(session);
  const hitOf = (e: SuppressionEntry): Hit =>
    admin ? { blocked: true, reason: e.reason, id: e.id, createdByName: e.createdByName, createdAt: e.createdAt } : { blocked: true, reason: e.reason };

  const results = items.map((i) => {
    const ph = i.phoneKeys.length ? hits.find((h) => h.kind === 'phone' && i.phoneKeys.includes(h.matchKey)) : undefined;
    const em = i.email ? hits.find((h) => h.kind === 'email' && h.matchKey === i.email) : undefined;
    const phone: Channel = i.phoneGiven ? (ph ? hitOf(ph) : { blocked: false }) : null;
    const email: Channel = i.emailGiven ? (em ? hitOf(em) : { blocked: false }) : null;
    // Given but not readable as a phone / an address: cannot be checked, so the caller must not open it.
    const unreadable = (i.phoneGiven && i.phoneKeys.length === 0) || (i.emailGiven && !i.email);
    return { blocked: !!(ph || em), phone, email, ...(unreadable ? { unreadable: true } : {}) };
  });
  return ok({ notSetUp, canRemove: admin, results });
}
