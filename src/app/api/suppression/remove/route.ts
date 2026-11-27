import { type NextRequest } from 'next/server';
import { getServerSession } from '@/lib/server/session';
import { limitPerUser } from '@/lib/server/userRateLimit';
import { getSuppressionStore, isSuppressionId } from '@/lib/server/suppressionStore';
import {
  canRemoveSuppression,
  fail,
  isCrossSiteRequest,
  logRef,
  ok,
  readSmallJson,
  suppressionStorageFail,
} from '@/lib/server/suppressionApi';
import { cleanNote, toListItem } from '@/lib/suppression';

/**
 * POST /api/suppression/remove  { id, note }
 * Take one entry off the signed-in person's workspace Do Not Contact list. Admins and above only (in the platform's
 * own workspace: platform staff only). A note saying why is required; the entry is kept, marked removed, with who
 * removed it, when and that note (the audit trail). An entry from another workspace is "not found".
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return fail(401, 'Please sign in again.');
  if (isCrossSiteRequest(req)) return fail(403, 'Request refused.');
  if (!canRemoveSuppression(session)) return fail(403, 'Only workspace admins can remove a contact from the Do Not Contact list.');
  const limited = limitPerUser('suppression-remove', session, { maxRequests: 20, windowMs: 600_000 });
  if (limited) return limited;
  const body = await readSmallJson(req);
  if (body === 'too_large') return fail(413, 'Request too large.');
  if (!body) return fail(400, 'Invalid request.');
  if (!isSuppressionId(body.id)) return fail(400, 'Invalid entry.', { field: 'id' });
  const note = cleanNote(body.note);
  if (note.length < 3) return fail(400, 'Say why this contact may be contacted again (at least 3 characters).', { field: 'note' });
  try {
    const removed = await getSuppressionStore().remove(session.tenantCode, body.id, { email: session.email, name: session.name || session.email }, note);
    if (!removed) return fail(404, 'That entry is not on your Do Not Contact list.');
    console.info(`[SUPPRESSION] removed tenant=${session.tenantCode} kind=${removed.kind} ref=${logRef(session.tenantCode, removed.matchKey)} by=${logRef(session.tenantCode, session.email)}`);
    return ok({ removed: { ...toListItem(removed), removedAt: removed.removedAt } });
  } catch (err) {
    return suppressionStorageFail(err, 'remove');
  }
}
