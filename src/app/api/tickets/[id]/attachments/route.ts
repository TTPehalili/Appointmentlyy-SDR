import { NextRequest } from 'next/server';
import { getServerSession } from '@/lib/server/session';
import { limitPerUser } from '@/lib/server/userRateLimit';
import { getSupportTicketStore, normalizeTicketId } from '@/lib/server/supportTickets';
import { isTicketReporter } from '@/lib/server/ticketScope';
import { checkScreenshot } from '@/lib/server/supportScreenshots';
import { fail, ok, readCapped, storageFail, viewerOf } from '@/lib/server/supportTicketsHttp';
import { SUPPORT_LIMITS } from '@/lib/supportReport';

/**
 * Screenshots live in the database (up to ~6.7 MB each as base64), so on top of 12 an hour per person, growth is capped
 * per person per day and per workspace per day: one member scripting uploads cannot fill the shared database.
 * (In memory, per server process, like every limitPerUser: a backstop, not a quota. See security/AUDIT.md.)
 */
const DAY_MS = 86_400_000;
const UPLOADS_PER_PERSON_PER_DAY = 24;
const UPLOADS_PER_WORKSPACE_PER_DAY = 60;

/**
 * POST /api/tickets/[id]/attachments   (body: the raw PNG, JPEG or WebP bytes, at most 5 MB)
 * Add one screenshot to a report, right after filing it. Only the person who filed it, within 30 minutes, at most 3.
 * The bytes are checked and rebuilt without metadata (supportScreenshots.ts) before they are stored.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(req);
  if (!session) return fail(401, 'Please sign in again.');
  const limited = limitPerUser('tickets-upload', session, { maxRequests: 12, windowMs: 3_600_000 });
  if (limited) return limited;
  const id = normalizeTicketId((await context.params).id);
  if (!id) return fail(404, 'Ticket not found');
  try {
    const store = getSupportTicketStore();
    const t = await store.get(id);
    if (!t || !isTicketReporter(t, viewerOf(session))) return fail(404, 'Ticket not found');
    if (Date.now() - Date.parse(t.createdAt) > SUPPORT_LIMITS.uploadWindowMs) return fail(409, 'Screenshots can only be added right after filing. Add a reply instead.');
    if ((t.attachmentCount ?? 0) >= SUPPORT_LIMITS.screenshots) return fail(409, `A report can have at most ${SUPPORT_LIMITS.screenshots} screenshots.`);
    // Counted only for uploads that could be stored (not for refused or unauthorised requests).
    const daily =
      limitPerUser('tickets-upload-day', session, { maxRequests: UPLOADS_PER_PERSON_PER_DAY, windowMs: DAY_MS }) ||
      limitPerUser('tickets-upload-workspace', { tenantCode: session.tenantCode, email: '*' }, { maxRequests: UPLOADS_PER_WORKSPACE_PER_DAY, windowMs: DAY_MS });
    if (daily) return daily;
    const bytes = await readCapped(req, SUPPORT_LIMITS.screenshotBytes);
    if (!bytes) return fail(413, 'That picture is too large. Use one under 5 MB.');
    const c = await checkScreenshot(bytes);
    if (!c.ok) return fail(400, c.error);
    const meta = await store.addAttachment(
      id,
      { mime: c.mime, size: c.bytes.length, width: c.width, height: c.height, sha256: c.sha256, data: c.bytes.toString('base64'), uploadedBy: session.email },
      SUPPORT_LIMITS.screenshots,
    );
    if (!meta) return fail(404, 'Ticket not found');
    if (meta === 'full') return fail(409, `A report can have at most ${SUPPORT_LIMITS.screenshots} screenshots.`);
    return ok({ attachment: meta }, 201);
  } catch (err) {
    return storageFail(err, 'upload');
  }
}
