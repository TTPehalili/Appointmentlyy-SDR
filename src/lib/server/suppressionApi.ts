/**
 * Shared server pieces of the Do Not Contact list (route files may only export handlers):
 * the add handler behind POST /api/suppression and POST /api/cadence/dnc, who may remove entries, the checks the
 * email send routes and the VICIdial dial relay run before they act, and log references that carry no personal data.
 *
 * Logs never contain a phone number, an email address or a lead's name: only a short one-way reference
 * (logRef) that support can compare, the workspace code and the kind of entry.
 */
import crypto from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { getAppBaseUrl } from '@/lib/authToken';
import { PLATFORM_TENANT_CODE } from '@/lib/roles';
import { getServerSession, hasRank, type ServerSession } from '@/lib/server/session';
import { limitPerUser } from '@/lib/server/userRateLimit';
import {
  SuppressionLimitError,
  SuppressionUnavailableError,
  getSuppressionStore,
  type NewSuppression,
} from '@/lib/server/suppressionStore';
import {
  phoneMatchKey,
  recipientEmails,
  toListItem,
  validateSuppressionInput,
  type SuppressionEntry,
  type SuppressionReason,
  type SuppressionSource,
} from '@/lib/suppression';

const NO_STORE = { 'Cache-Control': 'no-store' };

export const fail = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ success: false, status: 'error', error, message: error, ...extra }, { status, headers: NO_STORE });
export const ok = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json({ success: true, ...body }, { status, headers: NO_STORE });

/** Shown when the list cannot be used on this server yet (the database table has not been created). */
export const SUPPRESSION_UNAVAILABLE_MESSAGE =
  'The Do Not Contact list is not set up on this server yet, so nothing was saved. Calls and emails are not checked against it until it is. Please tell your admin.';
const SUPPRESSION_ERROR_MESSAGE = 'The Do Not Contact list could not be reached. Nothing was saved. Please try again.';

/** A short one-way reference for logs (never the value itself). */
export function logRef(tenantCode: string, value: string): string {
  return crypto.createHash('sha256').update(`appy-suppression:${tenantCode}:${value}`).digest('hex').slice(0, 10);
}

/**
 * Cookie-authenticated writes: refuse a browser request from another site. Behind Railway's proxy req.nextUrl.origin
 * is the internal address, so the host the browser actually used is accepted too (same rule as the ticket triage route).
 */
export function isCrossSiteRequest(req: NextRequest): boolean {
  const site = req.headers.get('sec-fetch-site');
  const origin = req.headers.get('origin');
  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').split(',')[0].trim().toLowerCase();
  const o = (origin || '').toLowerCase();
  const sameHost = !!host && (o === `https://${host}` || o === `http://${host}`);
  return Boolean((site && site !== 'same-origin' && site !== 'none') || (origin && !sameHost && origin !== req.nextUrl.origin && origin !== getAppBaseUrl()));
}

/**
 * Who may take an entry off the list: Admins and above in their own workspace. In the platform's own workspace
 * (shared by the owner, staff and the demo logins) only platform staff may, so a demo Admin login cannot undo a DNC.
 */
export function canRemoveSuppression(s: ServerSession): boolean {
  if (s.tenantCode === PLATFORM_TENANT_CODE) return s.isPlatformAdmin;
  return hasRank(s, 'Admin');
}

/** A JSON object body of at most `max` bytes: the object, 'too_large', or null (not JSON / not an object). */
export async function readSmallJson(req: NextRequest, max = 4096): Promise<Record<string, unknown> | 'too_large' | null> {
  if (Number(req.headers.get('content-length') || 0) > max) return 'too_large';
  let text: string;
  try {
    text = await req.text();
  } catch {
    return null;
  }
  if (text.length > max) return 'too_large';
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Storage errors in plain words; never the database message. */
export function suppressionStorageFail(err: unknown, where: string): NextResponse {
  if (err instanceof SuppressionUnavailableError) {
    console.warn(`[SUPPRESSION] ${where}: list not set up on this server (migration 20261202000000 not run)`);
    return fail(503, SUPPRESSION_UNAVAILABLE_MESSAGE, { code: 'SUPPRESSION_UNAVAILABLE', available: false });
  }
  if (err instanceof SuppressionLimitError) return fail(409, 'Your Do Not Contact list is full. Please contact support.', { code: 'SUPPRESSION_FULL' });
  console.error(`[SUPPRESSION] ${where}: storage error`, err instanceof Error ? err.message : 'unknown');
  return fail(503, SUPPRESSION_ERROR_MESSAGE, { code: 'SUPPRESSION_ERROR' });
}

/**
 * POST /api/suppression and POST /api/cadence/dnc: add a phone and/or email to the signed-in person's workspace list.
 * Any member may add (a rep marking a lead "Do not call"). Workspace and author come from the session only.
 */
export async function handleAddSuppression(
  req: NextRequest,
  opts: { scope: string; forced?: { reason?: SuppressionReason; source?: SuppressionSource } },
): Promise<NextResponse> {
  const session = await getServerSession(req);
  if (!session) return fail(401, 'Please sign in again.');
  if (isCrossSiteRequest(req)) return fail(403, 'Request refused.');
  const limited = limitPerUser(opts.scope, session, { maxRequests: 30, windowMs: 60_000 });
  if (limited) return limited;
  const body = await readSmallJson(req);
  if (body === 'too_large') return fail(413, 'Request too large.');
  const v = validateSuppressionInput(body, opts.forced);
  if (!v.ok) return fail(400, v.error, { field: v.field });
  const by = { createdByEmail: session.email, createdByName: session.name || session.email };
  const items: NewSuppression[] = [];
  if (v.value.phone) items.push({ kind: 'phone', value: v.value.phone.value, matchKey: v.value.phone.matchKey, reason: v.value.reason, note: v.value.note, source: v.value.source, ...by });
  if (v.value.email) items.push({ kind: 'email', value: v.value.email, matchKey: v.value.email, reason: v.value.reason, note: v.value.note, source: v.value.source, ...by });
  try {
    const { added, already } = await getSuppressionStore().add(session.tenantCode, items);
    for (const e of added) {
      console.info(`[SUPPRESSION] added tenant=${session.tenantCode} kind=${e.kind} reason=${e.reason} source=${e.source} ref=${logRef(session.tenantCode, e.matchKey)} by=${logRef(session.tenantCode, session.email)}`);
    }
    return ok({ status: 'suppressed', added: added.map(toListItem), already: already.map(toListItem) });
  } catch (err) {
    return suppressionStorageFail(err, 'add');
  }
}

export type SuppressionCheck =
  | { state: 'clear' }
  | { state: 'suppressed'; hits: SuppressionEntry[] }
  /** The list cannot exist yet on this server (migration not run): nothing can be on it. */
  | { state: 'not_set_up' }
  /** The list exists but could not be read just now: do not act. */
  | { state: 'error' };

let warnedNotSetUp = false;

/** Is any of these phones / emails on this workspace's list? */
export async function checkSuppression(tenantCode: string, keys: { phones: string[]; emails: string[] }): Promise<SuppressionCheck> {
  if (!keys.phones.length && !keys.emails.length) return { state: 'clear' };
  try {
    const hits = await getSuppressionStore().findActive(tenantCode, keys);
    return hits.length ? { state: 'suppressed', hits } : { state: 'clear' };
  } catch (err) {
    if (err instanceof SuppressionUnavailableError) {
      if (!warnedNotSetUp) {
        warnedNotSetUp = true;
        console.warn('[SUPPRESSION] list not set up on this server (migration 20261202000000 not run): sends and dials are not checked');
      }
      return { state: 'not_set_up' };
    }
    console.error('[SUPPRESSION] check failed', err instanceof Error ? err.message : 'unknown');
    return { state: 'error' };
  }
}

export const EMAIL_SUPPRESSED_MESSAGE =
  "This contact is on your workspace's Do Not Contact list, so nothing was sent.";
const EMAIL_CHECK_FAILED_MESSAGE =
  'The Do Not Contact list could not be checked just now, so nothing was sent. Please try again.';

/**
 * For the email send routes, before anything else is decided: the 409 to send when a recipient is on the signed-in
 * person's workspace list (or 503 when the list could not be checked), otherwise null. Signed out: null (the route's
 * own session check answers). Reads a copy of the body, so the route can still read it.
 */
export async function refuseSuppressedEmail(req: NextRequest, via: string): Promise<NextResponse | null> {
  const session = await getServerSession(req);
  if (!session) return null;
  let payload: unknown = null;
  try {
    payload = await req.clone().json();
  } catch {
    return null; // the route answers the malformed body
  }
  const emails = recipientEmails((payload as { to?: unknown } | null)?.to);
  const r = await checkSuppression(session.tenantCode, { phones: [], emails });
  if (r.state === 'suppressed') {
    console.info(`[SUPPRESSION] email skipped tenant=${session.tenantCode} via=${via} refs=${r.hits.map((h) => logRef(session.tenantCode, h.matchKey)).join(',')}`);
    return fail(409, EMAIL_SUPPRESSED_MESSAGE, { code: 'SUPPRESSED', suppressed: true });
  }
  if (r.state === 'error') return fail(503, EMAIL_CHECK_FAILED_MESSAGE, { code: 'SUPPRESSION_CHECK_FAILED' });
  return null;
}

export const DIAL_SUPPRESSED_MESSAGE = "This number is on your workspace's Do Not Call list. It was not dialed.";

/** For the dial relay: why this number may not be dialed now (status + message), or null when it may. */
export async function refuseSuppressedDial(session: ServerSession, phone: unknown): Promise<{ status: number; message: string } | null> {
  const key = phoneMatchKey(phone);
  if (!key) return null; // the relay rejects an invalid number itself
  const r = await checkSuppression(session.tenantCode, { phones: [key], emails: [] });
  if (r.state === 'suppressed') {
    console.info(`[SUPPRESSION] dial refused tenant=${session.tenantCode} ref=${logRef(session.tenantCode, key)}`);
    return { status: 409, message: DIAL_SUPPRESSED_MESSAGE };
  }
  if (r.state === 'error') return { status: 503, message: 'The Do Not Call list could not be checked just now, so the number was not dialed. Please try again.' };
  return null;
}
