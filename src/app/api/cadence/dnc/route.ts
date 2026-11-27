import { type NextRequest } from 'next/server';
import { handleAddSuppression } from '@/lib/server/suppressionApi';

/**
 * POST /api/cadence/dnc  { phone?, email?, note? }
 * Older name for "add to the Do Not Contact list" with the reason "do not call" (POST /api/suppression is the main
 * route). The entry is really saved in the signed-in person's workspace list; a failure says so (never a fake
 * success). No phone number, email or lead id is written to the logs.
 */
export async function POST(req: NextRequest) {
  return handleAddSuppression(req, { scope: 'suppression-add', forced: { reason: 'do_not_call', source: 'api' } });
}
