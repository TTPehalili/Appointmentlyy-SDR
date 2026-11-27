import { type NextRequest } from 'next/server';
import { getServerSession } from '@/lib/server/session';
import { limitPerUser } from '@/lib/server/userRateLimit';
import { getSuppressionStore } from '@/lib/server/suppressionStore';
import {
  canRemoveSuppression,
  fail,
  isCrossSiteRequest,
  logRef,
  ok,
  readSmallJson,
  suppressionStorageFail,
} from '@/lib/server/suppressionApi';
import { cleanNote, normalizeEmail } from '@/lib/suppression';

/**
 * POST /api/suppression/undo  { addedBy, from, to, note }
 * Undo a teammate's additions: take off the signed-in person's workspace Do Not Contact list every ACTIVE entry that
 * `addedBy` (their email) added between `from` and `to` (ISO times, inclusive). For cleaning up after a mistaken or
 * malicious mass "Do not call". Same rules as removing one entry: Admins and above only (platform workspace: platform
 * staff only), same-site, a note of at least 3 characters; every entry is kept, marked removed with who, when and the
 * note. Only this workspace's entries are touched. Answers how many were removed.
 */
const MAX_RANGE_MS = 366 * 24 * 3600_000;

const isoOf = (v: unknown): string | null => {
  if (typeof v !== 'string' || v.length > 40) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

export async function POST(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return fail(401, 'Please sign in again.');
  if (isCrossSiteRequest(req)) return fail(403, 'Request refused.');
  if (!canRemoveSuppression(session)) return fail(403, 'Only workspace admins can remove contacts from the Do Not Contact list.');
  const limited = limitPerUser('suppression-undo', session, { maxRequests: 10, windowMs: 600_000 });
  if (limited) return limited;
  const body = await readSmallJson(req);
  if (body === 'too_large') return fail(413, 'Request too large.');
  if (!body) return fail(400, 'Invalid request.');
  const addedBy = normalizeEmail(body.addedBy);
  if (!addedBy) return fail(400, 'Choose whose entries to undo.', { field: 'addedBy' });
  const from = isoOf(body.from);
  const to = isoOf(body.to);
  if (!from || !to) return fail(400, 'Give a start and an end time.', { field: !from ? 'from' : 'to' });
  if (from > to) return fail(400, 'The start must be before the end.', { field: 'from' });
  if (Date.parse(to) - Date.parse(from) > MAX_RANGE_MS) return fail(400, 'Choose a period of at most one year.', { field: 'from' });
  const note = cleanNote(body.note);
  if (note.length < 3) return fail(400, 'Say why these contacts may be contacted again (at least 3 characters).', { field: 'note' });
  try {
    const removed = await getSuppressionStore().removeAddedBy(session.tenantCode, addedBy, from, to, { email: session.email, name: session.name || session.email }, note);
    console.info(`[SUPPRESSION] bulk removed tenant=${session.tenantCode} count=${removed.length} author=${logRef(session.tenantCode, addedBy)} by=${logRef(session.tenantCode, session.email)}`);
    return ok({ removed: removed.length });
  } catch (err) {
    return suppressionStorageFail(err, 'undo');
  }
}
