import { type NextRequest } from 'next/server';
import { getServerSession } from '@/lib/server/session';
import { limitPerUser } from '@/lib/server/userRateLimit';
import { getSuppressionStore } from '@/lib/server/suppressionStore';
import { canRemoveSuppression, fail, handleAddSuppression, ok, suppressionStorageFail } from '@/lib/server/suppressionApi';
import { toListItem } from '@/lib/suppression';

/**
 * The signed-in person's workspace Do Not Contact list (src/lib/suppression.ts). Workspace from the session only.
 *
 * GET  /api/suppression   active entries, newest first (any member: the Dialer and Contacts show the badges)
 * POST /api/suppression   { phone?, email?, reason?, note?, source? } add (any member; same-site only)
 * Removing an entry: POST /api/suppression/remove (Admins only, with a note).
 */
const LIST_LIMIT = 5000;

export async function GET(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return fail(401, 'Please sign in again.');
  const limited = limitPerUser('suppression-read', session, { maxRequests: 120, windowMs: 60_000 });
  if (limited) return limited;
  try {
    const entries = await getSuppressionStore().listActive(session.tenantCode, LIST_LIMIT);
    return ok({ available: true, entries: entries.map(toListItem), canRemove: canRemoveSuppression(session) });
  } catch (err) {
    return suppressionStorageFail(err, 'list');
  }
}

export async function POST(req: NextRequest) {
  return handleAddSuppression(req, { scope: 'suppression-add' });
}
