import { type NextRequest } from 'next/server';
import { getServerSession } from '@/lib/server/session';
import { limitPerUser } from '@/lib/server/userRateLimit';
import { getSuppressionStore } from '@/lib/server/suppressionStore';
import { canRemoveSuppression, fail, handleAddSuppression, ok, suppressionStorageFail } from '@/lib/server/suppressionApi';
import { toListItem } from '@/lib/suppression';

/**
 * The signed-in person's workspace Do Not Contact list (src/lib/suppression.ts). Workspace from the session only.
 *
 * GET  /api/suppression   active entries, newest first, with who added each. Workspace admins only (the people who
 *                         may remove entries): the list holds other reps' prospects' phone numbers and emails. Everyone
 *                         else asks about one contact at a time with POST /api/suppression/check.
 * POST /api/suppression   { phone?, email?, reason?, note?, source? } add (any member; same-site only; daily cap for Reps)
 * Removing: POST /api/suppression/remove (one entry) and /api/suppression/undo (a teammate's entries in a time range).
 */
const LIST_LIMIT = 5000;

export async function GET(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return fail(401, 'Please sign in again.');
  if (!canRemoveSuppression(session)) return fail(403, 'Only workspace admins can see the Do Not Contact list.');
  const limited = limitPerUser('suppression-read', session, { maxRequests: 120, windowMs: 60_000 });
  if (limited) return limited;
  try {
    const entries = await getSuppressionStore().listActive(session.tenantCode, LIST_LIMIT);
    return ok({
      available: true,
      entries: entries.map((e) => ({ ...toListItem(e), createdByEmail: e.createdByEmail })),
      canRemove: true,
    });
  } catch (err) {
    return suppressionStorageFail(err, 'list');
  }
}

export async function POST(req: NextRequest) {
  return handleAddSuppression(req, { scope: 'suppression-add' });
}
