import { NextRequest } from 'next/server';
import { getServerSession } from '@/lib/server/session';
import { limitPerUser } from '@/lib/server/userRateLimit';
import { getSupportTicketStore, normalizeTicketId } from '@/lib/server/supportTickets';
import { isTicketReporter } from '@/lib/server/ticketScope';
import { checkScreenshot } from '@/lib/server/supportScreenshots';
import { fail, ok, readCapped, storageFail, viewerOf } from '@/lib/server/supportTicketsHttp';
import { SUPPORT_LIMITS } from '@/lib/supportReport';
import { afterScreenshotStored, attachmentQuota, quotaRefusalMessage, scheduleScreenshotRetention } from '@/lib/server/supportShotQuota';

/**
 * POST /api/tickets/[id]/attachments   (body: the raw PNG, JPEG or WebP bytes, at most 5 MB)
 * Add one screenshot to a report, right after filing it. Only the person who filed it, within 30 minutes, at most 3.
 * The bytes are checked and rebuilt without metadata (supportScreenshots.ts) before they are stored.
 *
 * Screenshots live in the database (up to ~6.7 MB each as base64). Besides 12 an hour per person (in memory, a burst
 * limit), growth is capped durably, counted from the stored rows when saving (supportShotQuota.ts): per person per
 * day and per workspace per 30 days. Over a cap the screenshot is refused (429); the report itself is already saved.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(req);
  if (!session) return fail(401, 'Please sign in again.');
  const limited = limitPerUser('tickets-upload', session, { maxRequests: 12, windowMs: 3_600_000 });
  if (limited) return limited;
  scheduleScreenshotRetention();
  const id = normalizeTicketId((await context.params).id);
  if (!id) return fail(404, 'Ticket not found');
  try {
    const store = getSupportTicketStore();
    const t = await store.get(id);
    if (!t || !isTicketReporter(t, viewerOf(session))) return fail(404, 'Ticket not found');
    if (Date.now() - Date.parse(t.createdAt) > SUPPORT_LIMITS.uploadWindowMs) return fail(409, 'Screenshots can only be added right after filing. Add a reply instead.');
    if ((t.attachmentCount ?? 0) >= SUPPORT_LIMITS.screenshots) return fail(409, quotaRefusalMessage('ticket_full'));
    const bytes = await readCapped(req, SUPPORT_LIMITS.screenshotBytes);
    if (!bytes) return fail(413, 'That picture is too large. Use one under 5 MB.');
    const c = await checkScreenshot(bytes);
    if (!c.ok) return fail(400, c.error);
    const res = await store.addAttachment(
      id,
      { mime: c.mime, size: c.bytes.length, width: c.width, height: c.height, sha256: c.sha256, data: c.bytes.toString('base64'), uploadedBy: session.email },
      attachmentQuota(),
    );
    if (!res.ok) {
      if (res.reason === 'not_found') return fail(404, 'Ticket not found');
      if (res.reason === 'ticket_full') return fail(409, quotaRefusalMessage('ticket_full'));
      return fail(429, quotaRefusalMessage(res.reason), { quota: res.reason === 'user_daily' ? 'user_daily' : 'workspace' });
    }
    afterScreenshotStored(t, res.tenantCode, res.usage);
    return ok({ attachment: res.attachment }, 201);
  } catch (err) {
    return storageFail(err, 'upload');
  }
}
